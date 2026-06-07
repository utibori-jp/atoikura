package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

func ListExpenseCategoriesHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		categories, err := repo.ListExpenseCategoriesByUser(r.Context(), user_id)
		if err != nil {
			slog.Error("listing expense categories", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		type expenseCategoryJSON struct {
			ID           int32   `json:"id"`
			CategoryName string  `json:"category_name"`
			CategoryCode *string `json:"category_code"`
			GroupID      int32   `json:"group_id"`
			GroupName    string  `json:"group_name"`
			Description  *string `json:"description"`
		}
		type responseJSON struct {
			ExpenseCategories []expenseCategoryJSON `json:"expense_categories"`
		}

		items := make([]expenseCategoryJSON, len(categories))
		for i, c := range categories {
			items[i] = expenseCategoryJSON{
				ID:           c.ID,
				CategoryName: c.CategoryName,
				CategoryCode: c.CategoryCode,
				GroupID:      c.GroupID,
				GroupName:    c.GroupName,
				Description:  c.Description,
			}
		}
		WriteJSON(w, http.StatusOK, responseJSON{ExpenseCategories: items})
	}
}

func CreateExpenseCategoryHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		var body struct {
			CategoryName string  `json:"category_name"`
			GroupID      int32   `json:"group_id"`
			Description  *string `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}
		if body.CategoryName == "" {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "category_nameは必須です")
			return
		}
		if body.GroupID <= 0 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "group_idは必須です")
			return
		}

		category, err := repo.CreateExpenseCategory(r.Context(), user_id, body.GroupID, body.CategoryName, body.Description)
		if err != nil {
			if errors.Is(err, repository.ErrDuplicateExpenseCategoryName) {
				WriteError(w, http.StatusConflict, "CONFLICT", "同名の生活区分が既に存在します")
				return
			}
			slog.Error("creating expense category", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		WriteJSON(w, http.StatusCreated, buildExpenseCategoryJSON(category))
	}
}

func UpdateExpenseCategoryHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		id, ok := parsePathID(w, r)
		if !ok {
			return
		}

		var body struct {
			CategoryName string  `json:"category_name"`
			GroupID      int32   `json:"group_id"`
			Description  *string `json:"description"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}
		if body.CategoryName == "" {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "category_nameは必須です")
			return
		}
		if body.GroupID <= 0 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "group_idは必須です")
			return
		}

		category, err := repo.UpdateExpenseCategory(r.Context(), id, user_id, body.GroupID, body.CategoryName, body.Description)
		if err != nil {
			if errors.Is(err, repository.ErrDuplicateExpenseCategoryName) {
				WriteError(w, http.StatusConflict, "CONFLICT", "同名の生活区分が既に存在します")
				return
			}
			if errors.Is(err, repository.ErrNotFound) {
				WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "指定した大分類が見つかりません")
				return
			}
			slog.Error("updating expense category", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		if category == nil {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "生活区分が見つかりません")
			return
		}

		WriteJSON(w, http.StatusOK, buildExpenseCategoryJSON(category))
	}
}

func DeleteExpenseCategoryHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		id, ok := parsePathID(w, r)
		if !ok {
			return
		}

		if err := repo.DeleteExpenseCategory(r.Context(), id, user_id); err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				WriteError(w, http.StatusNotFound, "NOT_FOUND", "生活区分が見つかりません")
				return
			}
			slog.Error("deleting expense category", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

type expenseCategoryResponse struct {
	ID           int32   `json:"id"`
	CategoryName string  `json:"category_name"`
	CategoryCode *string `json:"category_code"`
	GroupID      int32   `json:"group_id"`
	GroupName    string  `json:"group_name"`
	Description  *string `json:"description"`
}

func buildExpenseCategoryJSON(c *repository.ExpenseCategoryView) expenseCategoryResponse {
	return expenseCategoryResponse{
		ID:           c.ID,
		CategoryName: c.CategoryName,
		CategoryCode: c.CategoryCode,
		GroupID:      c.GroupID,
		GroupName:    c.GroupName,
		Description:  c.Description,
	}
}
