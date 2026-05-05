package handler

import (
	"log/slog"
	"net/http"

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
