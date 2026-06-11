package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
)

type savingsGoalRepo interface {
	ListSavingsGoals(ctx context.Context, user_id int64) ([]repository.SavingsGoalResult, error)
	CreateSavingsGoal(ctx context.Context, user_id int64, params repository.CreateSavingsGoalParams) (*repository.SavingsGoalResult, error)
	UpdateSavingsGoal(ctx context.Context, user_id int64, params repository.UpdateSavingsGoalParams) (*repository.SavingsGoalResult, error)
	PostMonthlySavings(ctx context.Context, id int64, user_id int64, amount int32, year_month string) (*repository.SavingsGoalResult, error)
	DeleteSavingsGoal(ctx context.Context, id int64, user_id int64) (bool, error)
}

type savingsGoalJSON struct {
	ID                int32   `json:"id"`
	Name              string  `json:"name"`
	Emoji             string  `json:"emoji"`
	MonthlyAmount     int32   `json:"monthly_amount"`
	TargetAmount      int32   `json:"target_amount"`
	AccumulatedAmount int32   `json:"accumulated_amount"`
	Deadline          *string `json:"deadline"`
	Memo              string  `json:"memo"`
	IsPostedThisMonth bool    `json:"is_posted_this_month"`
}

func toSavingsGoalJSON(g repository.SavingsGoalResult, year_month string) savingsGoalJSON {
	is_posted := g.LastPostedMonth != nil && *g.LastPostedMonth == year_month
	return savingsGoalJSON{
		ID:                g.ID,
		Name:              g.Name,
		Emoji:             g.Emoji,
		MonthlyAmount:     g.MonthlyAmount,
		TargetAmount:      g.TargetAmount,
		AccumulatedAmount: g.AccumulatedAmount,
		Deadline:          g.Deadline,
		Memo:              g.Memo,
		IsPostedThisMonth: is_posted,
	}
}

func ListSavingsGoalsHandler(repo savingsGoalRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		goals, err := repo.ListSavingsGoals(r.Context(), user_id)
		if err != nil {
			slog.Error("listing savings goals", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		year_month := r.URL.Query().Get("year_month")
		if year_month == "" {
			loc, err := time.LoadLocation("Asia/Tokyo")
			if err != nil {
				loc = time.FixedZone("JST", 9*60*60)
			}
			year_month = time.Now().In(loc).Format("2006-01")
		}

		items := make([]savingsGoalJSON, len(goals))
		for i, g := range goals {
			items[i] = toSavingsGoalJSON(g, year_month)
		}

		WriteJSON(w, http.StatusOK, map[string]any{"savings_goals": items})
	}
}

func CreateSavingsGoalHandler(repo savingsGoalRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		type request struct {
			Name          *string `json:"name"`
			Emoji         *string `json:"emoji"`
			MonthlyAmount *int32  `json:"monthly_amount"`
			TargetAmount  *int32  `json:"target_amount"`
			Deadline      *string `json:"deadline"`
			Memo          string  `json:"memo"`
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}

		if req.Name == nil || *req.Name == "" {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "nameは必須です")
			return
		}
		if len([]rune(*req.Name)) > 50 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "nameは50文字以内で入力してください")
			return
		}
		if req.Emoji == nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "emojiは必須です")
			return
		}
		if req.MonthlyAmount == nil || *req.MonthlyAmount < 0 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "monthly_amountは0以上の整数で指定してください")
			return
		}
		if req.TargetAmount == nil || *req.TargetAmount < 0 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "target_amountは0以上の整数で指定してください")
			return
		}

		goal, err := repo.CreateSavingsGoal(r.Context(), user_id, repository.CreateSavingsGoalParams{
			Name:          *req.Name,
			Emoji:         *req.Emoji,
			MonthlyAmount: *req.MonthlyAmount,
			TargetAmount:  *req.TargetAmount,
			Deadline:      req.Deadline,
			Memo:          req.Memo,
		})
		if err != nil {
			slog.Error("creating savings goal", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}

		WriteJSON(w, http.StatusCreated, toSavingsGoalJSON(*goal, ""))
	}
}

func UpdateSavingsGoalHandler(repo savingsGoalRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		goal_id, ok := parsePathID(w, r)
		if !ok {
			return
		}

		type request struct {
			Name          *string `json:"name"`
			Emoji         *string `json:"emoji"`
			MonthlyAmount *int32  `json:"monthly_amount"`
			TargetAmount  *int32  `json:"target_amount"`
			Deadline      *string `json:"deadline"`
			Memo          string  `json:"memo"`
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}

		if req.Name == nil || *req.Name == "" {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "nameは必須です")
			return
		}
		if len([]rune(*req.Name)) > 50 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "nameは50文字以内で入力してください")
			return
		}
		if req.Emoji == nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "emojiは必須です")
			return
		}
		if req.MonthlyAmount == nil || *req.MonthlyAmount < 0 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "monthly_amountは0以上の整数で指定してください")
			return
		}
		if req.TargetAmount == nil || *req.TargetAmount < 0 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "target_amountは0以上の整数で指定してください")
			return
		}

		goal, err := repo.UpdateSavingsGoal(r.Context(), user_id, repository.UpdateSavingsGoalParams{
			ID:            int32(goal_id),
			Name:          *req.Name,
			Emoji:         *req.Emoji,
			MonthlyAmount: *req.MonthlyAmount,
			TargetAmount:  *req.TargetAmount,
			Deadline:      req.Deadline,
			Memo:          req.Memo,
		})
		if err != nil {
			slog.Error("updating savings goal", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		if goal == nil {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "貯金目標が見つかりません")
			return
		}

		WriteJSON(w, http.StatusOK, toSavingsGoalJSON(*goal, ""))
	}
}

func DeleteSavingsGoalHandler(repo savingsGoalRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		goal_id, ok := parsePathID(w, r)
		if !ok {
			return
		}

		deleted, err := repo.DeleteSavingsGoal(r.Context(), goal_id, user_id)
		if err != nil {
			slog.Error("deleting savings goal", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		if !deleted {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "貯金目標が見つかりません")
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func PostMonthlySavingsHandler(repo savingsGoalRepo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		goal_id, ok := parsePathID(w, r)
		if !ok {
			return
		}

		type request struct {
			Amount    *int32  `json:"amount"`
			YearMonth *string `json:"year_month"`
		}
		var req request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}

		if req.Amount == nil || *req.Amount < 1 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "amountは正の整数で指定してください")
			return
		}
		if req.YearMonth == nil || !yearMonthPattern.MatchString(*req.YearMonth) {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "year_monthはYYYY-MM形式で指定してください")
			return
		}

		goal, err := repo.PostMonthlySavings(r.Context(), goal_id, user_id, *req.Amount, *req.YearMonth)
		if err != nil {
			slog.Error("posting monthly savings", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		if goal == nil {
			WriteError(w, http.StatusNotFound, "NOT_FOUND", "貯金目標が見つかりません")
			return
		}

		WriteJSON(w, http.StatusOK, toSavingsGoalJSON(*goal, *req.YearMonth))
	}
}
