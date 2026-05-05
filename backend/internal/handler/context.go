package handler

import "context"

type contextKey string

const userIDContextKey contextKey = "user_id"

func WithUserID(ctx context.Context, user_id int64) context.Context {
	return context.WithValue(ctx, userIDContextKey, user_id)
}

func UserIDFromContext(ctx context.Context) (int64, bool) {
	user_id, ok := ctx.Value(userIDContextKey).(int64)
	return user_id, ok
}
