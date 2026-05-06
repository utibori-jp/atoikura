package handler

import (
	"log/slog"
	"net/http"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

func ListStatementTypesHandler(repo *repository.Repository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		types, err := repo.ListStatementTypes(r.Context())
		if err != nil {
			slog.Error("listing statement types", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		type statementTypeJSON struct {
			ID                int32  `json:"id"`
			TypeCode          string `json:"type_code"`
			StatementTypeName string `json:"statement_type_name"`
		}
		type responseJSON struct {
			StatementTypes []statementTypeJSON `json:"statement_types"`
		}

		items := make([]statementTypeJSON, len(types))
		for i, t := range types {
			items[i] = statementTypeJSON{
				ID:                t.ID,
				TypeCode:          t.TypeCode,
				StatementTypeName: t.StatementTypeName,
			}
		}
		WriteJSON(w, http.StatusOK, responseJSON{StatementTypes: items})
	}
}
