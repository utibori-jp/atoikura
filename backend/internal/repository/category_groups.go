package repository

import (
	"context"
	"fmt"
)

type StatementTypeView struct {
	ID                int32  `json:"id"`
	TypeCode          string `json:"type_code"`
	StatementTypeName string `json:"statement_type_name"`
}

type CategoryGroupView struct {
	ID            int32             `json:"id"`
	GroupName     string            `json:"group_name"`
	StatementType StatementTypeView `json:"statement_type"`
	Description   *string           `json:"description"`
}

func (r *Repository) ListCategoryGroupsByUser(ctx context.Context, user_id int64) ([]CategoryGroupView, error) {
	rows, err := r.queries.ListCategoryGroupsByUser(ctx, int32(user_id))
	if err != nil {
		return nil, fmt.Errorf("listing category groups: %w", err)
	}

	result := make([]CategoryGroupView, len(rows))
	for i, row := range rows {
		result[i] = CategoryGroupView{
			ID:        row.ID,
			GroupName: row.GroupName,
			StatementType: StatementTypeView{
				ID:                row.StatementTypeID,
				TypeCode:          row.StatementTypeCode,
				StatementTypeName: row.StatementTypeName,
			},
			Description: row.Description,
		}
	}
	return result, nil
}
