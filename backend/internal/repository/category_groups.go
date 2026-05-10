package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/utibori-jp/atoikura/backend/internal/db"
)

var (
	ErrNotFound                     = errors.New("not found")
	ErrDuplicateCategoryGroupName   = errors.New("duplicate category group name")
	ErrCategoryGroupHasChildren     = errors.New("category group has expense categories")
	ErrDuplicateExpenseCategoryName = errors.New("duplicate expense category name")
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

func (r *Repository) GetCategoryGroup(ctx context.Context, id int64, user_id int64) (*CategoryGroupView, error) {
	row, err := r.queries.GetCategoryGroupByID(ctx, db.GetCategoryGroupByIDParams{
		ID:     int32(id),
		UserID: int32(user_id),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("getting category group: %w", err)
	}
	return &CategoryGroupView{
		ID:        row.ID,
		GroupName: row.GroupName,
		StatementType: StatementTypeView{
			ID:                row.StatementTypeID,
			TypeCode:          row.StatementTypeCode,
			StatementTypeName: row.StatementTypeName,
		},
		Description: row.Description,
	}, nil
}

func (r *Repository) CreateCategoryGroup(ctx context.Context, user_id int64, group_name string, statement_type_id int32, description *string) (*CategoryGroupView, error) {
	_, err := r.queries.CreateCategoryGroup(ctx, db.CreateCategoryGroupParams{
		UserID:          int32(user_id),
		GroupName:       group_name,
		StatementTypeID: statement_type_id,
		Description:     description,
	})
	if err != nil {
		var pg_err *pgconn.PgError
		if errors.As(err, &pg_err) && pg_err.Code == "23505" {
			return nil, ErrDuplicateCategoryGroupName
		}
		return nil, fmt.Errorf("creating category group: %w", err)
	}

	// Fetch full view with statement_type join; requires a second query because
	// INSERT RETURNING cannot join to statement_types.
	// We query by name+user to avoid needing the id from RETURNING.
	groups, err := r.queries.ListCategoryGroupsByUser(ctx, int32(user_id))
	if err != nil {
		return nil, fmt.Errorf("fetching created category group: %w", err)
	}
	for _, g := range groups {
		if g.GroupName == group_name {
			return &CategoryGroupView{
				ID:        g.ID,
				GroupName: g.GroupName,
				StatementType: StatementTypeView{
					ID:                g.StatementTypeID,
					TypeCode:          g.StatementTypeCode,
					StatementTypeName: g.StatementTypeName,
				},
				Description: g.Description,
			}, nil
		}
	}
	return nil, fmt.Errorf("newly created category group not found")
}

func (r *Repository) UpdateCategoryGroup(ctx context.Context, id int64, user_id int64, group_name string, statement_type_id int32, description *string) (*CategoryGroupView, error) {
	rows_affected, err := r.queries.UpdateCategoryGroupByID(ctx, db.UpdateCategoryGroupByIDParams{
		ID:              int32(id),
		UserID:          int32(user_id),
		GroupName:       group_name,
		StatementTypeID: statement_type_id,
		Description:     description,
	})
	if err != nil {
		var pg_err *pgconn.PgError
		if errors.As(err, &pg_err) && pg_err.Code == "23505" {
			return nil, ErrDuplicateCategoryGroupName
		}
		return nil, fmt.Errorf("updating category group: %w", err)
	}
	if rows_affected == 0 {
		return nil, nil
	}
	return r.GetCategoryGroup(ctx, id, user_id)
}

func (r *Repository) DeleteCategoryGroup(ctx context.Context, id int64, user_id int64) error {
	count, err := r.queries.CountActiveExpenseCategoriesByGroup(ctx, db.CountActiveExpenseCategoriesByGroupParams{
		GroupID: int32(id),
		UserID:  int32(user_id),
	})
	if err != nil {
		return fmt.Errorf("counting expense categories: %w", err)
	}
	if count > 0 {
		return ErrCategoryGroupHasChildren
	}

	rows_affected, err := r.queries.SoftDeleteCategoryGroup(ctx, db.SoftDeleteCategoryGroupParams{
		ID:     int32(id),
		UserID: int32(user_id),
	})
	if err != nil {
		return fmt.Errorf("deleting category group: %w", err)
	}
	if rows_affected == 0 {
		return ErrNotFound
	}
	return nil
}
