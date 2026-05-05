package handler

import (
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
