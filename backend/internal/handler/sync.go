package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/syncrules"
)

const (
	// SyncProtocolHeader carries the sync protocol version on every /sync request
	// and response.
	SyncProtocolHeader = "X-Atoikura-Sync-Protocol"

	maxPushBodyBytes = 1 << 20
	defaultPullLimit = 500
	maxPullLimit     = 1000
)

// syncRepository is the subset of repository.Repository used by the sync handlers.
type syncRepository interface {
	Push(ctx context.Context, user_id int64, push_inputs []repository.PushInput) ([]repository.PushResult, error)
	Pull(ctx context.Context, user_id int64, since int64, limit int) (*repository.PullResult, error)
}

// RequireSyncProtocol rejects clients whose sync protocol is missing or too old
// with 426, so that an outdated client asks the user to update instead of
// corrupting data.
func RequireSyncProtocol(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set(SyncProtocolHeader, strconv.Itoa(syncrules.ProtocolVersion))
		client_protocol_version, err := strconv.Atoi(r.Header.Get(SyncProtocolHeader))
		if err != nil || client_protocol_version < syncrules.MinSupportedProtocolVersion {
			WriteError(w, http.StatusUpgradeRequired, "UPDATE_REQUIRED", "アプリを最新版に更新してください")
			return
		}
		next.ServeHTTP(w, r)
	})
}

type pushResultJSON struct {
	ID         string   `json:"id"`
	Status     string   `json:"status"`
	Seq        *int64   `json:"seq,omitempty"`
	Superseded []string `json:"superseded,omitempty"`
	MergedInto *string  `json:"merged_into,omitempty"`
	Reason     string   `json:"reason,omitempty"`
	Message    string   `json:"message,omitempty"`
}

// PushHandler applies a batch of offline-writable changes. The body and the
// number of changes are bounded before anything is applied.
func PushHandler(repo syncRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		type pushRequestJSON struct {
			Changes []json.RawMessage `json:"changes"`
		}
		var req pushRequestJSON
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxPushBodyBytes)).Decode(&req); err != nil {
			var max_bytes_error *http.MaxBytesError
			if errors.As(err, &max_bytes_error) {
				WriteError(w, http.StatusRequestEntityTooLarge, "TOO_LARGE", "送信データが大きすぎます")
				return
			}
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
			return
		}
		if len(req.Changes) == 0 || len(req.Changes) > syncrules.MaxChangesPerPush {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "一度に送信できる変更は1〜500件です")
			return
		}

		push_inputs := make([]repository.PushInput, 0, len(req.Changes))
		for _, raw_change := range req.Changes {
			var change syncrules.Change
			if err := json.Unmarshal(raw_change, &change); err != nil {
				WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "リクエストの形式が不正です")
				return
			}
			push_inputs = append(push_inputs, repository.PushInput{Change: change, Size: len(raw_change)})
		}

		push_results, err := repo.Push(r.Context(), user_id, push_inputs)
		if err != nil {
			slog.Error("pushing changes", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		push_results_json := make([]pushResultJSON, 0, len(push_results))
		for _, push_result := range push_results {
			push_result_json := pushResultJSON{
				ID:         push_result.ID,
				Status:     "applied",
				Seq:        push_result.Seq,
				Superseded: push_result.Superseded,
				MergedInto: push_result.MergedInto,
			}
			if !push_result.Applied {
				push_result_json.Status = "rejected"
				push_result_json.Reason = push_result.Reason
				push_result_json.Message = push_result.Message
			}
			push_results_json = append(push_results_json, push_result_json)
		}
		WriteJSON(w, http.StatusOK, map[string]any{"results": push_results_json})
	}
}

type pulledRowJSON struct {
	Collection string                     `json:"collection"`
	ID         string                     `json:"id"`
	LedgerID   string                     `json:"ledger_id"`
	OwnerID    int64                      `json:"owner_id"`
	Seq        int64                      `json:"seq"`
	Deleted    bool                       `json:"deleted"`
	Data       map[string]json.RawMessage `json:"data"`
	FieldHLC   map[string]string          `json:"field_hlc,omitempty"`
}

// pullResponseJSON names the ledgers the page covers (sync-protocol.md §4): a
// device starts over from 0 when that set changes.
type pullResponseJSON struct {
	LedgerIDs         []string        `json:"ledger_ids"`
	PersonalLedgerID  string          `json:"personal_ledger_id"`
	HouseholdLedgerID *string         `json:"household_ledger_id"`
	Rows              []pulledRowJSON `json:"rows"`
	NextSince         int64           `json:"next_since"`
	HasMore           bool            `json:"has_more"`
}

// PullHandler returns the changes of the caller's ledgers after a cursor.
func PullHandler(repo syncRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := UserIDFromContext(r.Context())
		if !ok {
			WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
			return
		}

		since, err := strconv.ParseInt(r.URL.Query().Get("since"), 10, 64)
		if err != nil || since < 0 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "sinceが不正です")
			return
		}
		pull_limit := defaultPullLimit
		if limit_text := r.URL.Query().Get("limit"); limit_text != "" {
			pull_limit, err = strconv.Atoi(limit_text)
			if err != nil || pull_limit < 1 || pull_limit > maxPullLimit {
				WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "limitは1〜1000で指定してください")
				return
			}
		}

		pull_result, err := repo.Pull(r.Context(), user_id, since, pull_limit)
		if err != nil {
			slog.Error("pulling changes", "error", err)
			WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "予期しないエラーが発生しました")
			return
		}
		pulled_rows_json := make([]pulledRowJSON, 0, len(pull_result.Rows))
		for _, pulled_row := range pull_result.Rows {
			pulled_rows_json = append(pulled_rows_json, pulledRowJSON(pulled_row))
		}
		var household_ledger_id *string
		if pull_result.Ledgers.HouseholdID != "" {
			household_ledger_id = &pull_result.Ledgers.HouseholdID
		}
		WriteJSON(w, http.StatusOK, pullResponseJSON{
			LedgerIDs:         pull_result.Ledgers.VisibleIDs(),
			PersonalLedgerID:  pull_result.Ledgers.PersonalID,
			HouseholdLedgerID: household_ledger_id,
			Rows:              pulled_rows_json,
			NextSince:         pull_result.NextSince,
			HasMore:           pull_result.HasMore,
		})
	}
}
