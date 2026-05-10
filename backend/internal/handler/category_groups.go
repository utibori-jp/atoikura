package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

func ListCategoryGroupsHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		groups, err := repo.ListCategoryGroupsByUser(r.Context(), user_id)
		if err != nil {
			slog.Error("listing category groups", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		type statementTypeJSON struct {
			ID                int32  `json:"id"`
			TypeCode          string `json:"type_code"`
			StatementTypeName string `json:"statement_type_name"`
		}
		type categoryGroupJSON struct {
			ID            int32             `json:"id"`
			GroupName     string            `json:"group_name"`
			StatementType statementTypeJSON `json:"statement_type"`
			Description   *string           `json:"description"`
		}
		type responseJSON struct {
			CategoryGroups []categoryGroupJSON `json:"category_groups"`
		}

		items := make([]categoryGroupJSON, len(groups))
		for i, g := range groups {
			items[i] = categoryGroupJSON{
				ID:        g.ID,
				GroupName: g.GroupName,
				StatementType: statementTypeJSON{
					ID:                g.StatementType.ID,
					TypeCode:          g.StatementType.TypeCode,
					StatementTypeName: g.StatementType.StatementTypeName,
				},
				Description: g.Description,
			}
		}
		WriteJSON(w, http.StatusOK, responseJSON{CategoryGroups: items})
	}
}

func CreateCategoryGroupHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		var body struct {
			GroupName       string  `json:"group_name"`
			StatementTypeID int32   `json:"statement_type_id"`
			Description     *string `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}
		if body.GroupName == "" {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "group_nameは必須です")
			return
		}
		if body.StatementTypeID <= 0 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "statement_type_idは必須です")
			return
		}

		group, err := repo.CreateCategoryGroup(r.Context(), user_id, body.GroupName, body.StatementTypeID, body.Description)
		if err != nil {
			if errors.Is(err, repository.ErrDuplicateCategoryGroupName) {
				WriteError(w, http.StatusConflict, "CONFLICT", "同名の大分類が既に存在します")
				return
			}
			slog.Error("creating category group", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		WriteJSON(w, http.StatusCreated, buildCategoryGroupJSON(group))
	}
}

func UpdateCategoryGroupHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "idが不正です")
			return
		}

		var body struct {
			GroupName       string  `json:"group_name"`
			StatementTypeID int32   `json:"statement_type_id"`
			Description     *string `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}
		if body.GroupName == "" {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "group_nameは必須です")
			return
		}
		if body.StatementTypeID <= 0 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "statement_type_idは必須です")
			return
		}

		group, err := repo.UpdateCategoryGroup(r.Context(), id, user_id, body.GroupName, body.StatementTypeID, body.Description)
		if err != nil {
			if errors.Is(err, repository.ErrDuplicateCategoryGroupName) {
				WriteError(w, http.StatusConflict, "CONFLICT", "同名の大分類が既に存在します")
				return
			}
			slog.Error("updating category group", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		if group == nil {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "大分類が見つかりません")
			return
		}

		WriteJSON(w, http.StatusOK, buildCategoryGroupJSON(group))
	}
}

func DeleteCategoryGroupHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
		if err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "idが不正です")
			return
		}

		if err := repo.DeleteCategoryGroup(r.Context(), id, user_id); err != nil {
			if errors.Is(err, repository.ErrCategoryGroupHasChildren) {
				WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "紐づく生活区分が存在するため削除できません")
				return
			}
			if errors.Is(err, repository.ErrNotFound) {
				WriteError(w, http.StatusNotFound, "NOT_FOUND", "大分類が見つかりません")
				return
			}
			slog.Error("deleting category group", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

type categoryGroupResponse struct {
	ID            int32              `json:"id"`
	GroupName     string             `json:"group_name"`
	StatementType statementTypeResp  `json:"statement_type"`
	Description   *string            `json:"description"`
}

type statementTypeResp struct {
	ID                int32  `json:"id"`
	TypeCode          string `json:"type_code"`
	StatementTypeName string `json:"statement_type_name"`
}

func buildCategoryGroupJSON(g *repository.CategoryGroupView) categoryGroupResponse {
	return categoryGroupResponse{
		ID:        g.ID,
		GroupName: g.GroupName,
		StatementType: statementTypeResp{
			ID:                g.StatementType.ID,
			TypeCode:          g.StatementType.TypeCode,
			StatementTypeName: g.StatementType.StatementTypeName,
		},
		Description: g.Description,
	}
}
