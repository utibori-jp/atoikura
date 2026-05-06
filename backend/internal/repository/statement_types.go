package repository

import (
	"context"
	"fmt"
)

func (r *Repository) ListStatementTypes(ctx context.Context) ([]StatementTypeView, error) {
	rows, err := r.queries.ListStatementTypes(ctx)
	if err != nil {
		return nil, fmt.Errorf("listing statement types: %w", err)
	}

	result := make([]StatementTypeView, len(rows))
	for i, row := range rows {
		result[i] = StatementTypeView{
			ID:                row.ID,
			TypeCode:          row.TypeCode,
			StatementTypeName: row.StatementTypeName,
		}
	}
	return result, nil
}
