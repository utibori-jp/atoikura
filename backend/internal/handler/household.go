package handler

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/utibori-jp/atoikura/backend/internal/repository"
	"github.com/utibori-jp/atoikura/backend/internal/syncrules"
)

// Household lifecycle commands (design.md §6). The household is always the
// caller's, resolved from the token; no request names a ledger. After a
// lifecycle command the device syncs, and the changed ledger set restarts its
// pull.

// maxInvitationTokenLength bounds a redeemed token; issued tokens are 43 characters.
const maxInvitationTokenLength = 128

// householdRepository is the subset of repository.Repository used by the
// household handlers.
type householdRepository interface {
	CreateHousehold(ctx context.Context, user_id int64, household_name string) (string, error)
	CreateHouseholdInvitation(ctx context.Context, user_id int64) (*repository.CreatedInvitation, error)
	ListHouseholdInvitations(ctx context.Context, user_id int64) ([]repository.OpenInvitation, error)
	RevokeHouseholdInvitation(ctx context.Context, user_id int64, invitation_id string) error
	JoinHousehold(ctx context.Context, user_id int64, join_input repository.JoinInput) (string, error)
	LeaveHousehold(ctx context.Context, user_id int64) error
	RemoveHouseholdMember(ctx context.Context, user_id int64, member_id int64) error
	DissolveHousehold(ctx context.Context, user_id int64) error
	PutHouseholdAllowance(ctx context.Context, user_id int64, member_id int64, effective_from string, amount int32) (*repository.PulledRow, error)
}

type householdLedgerJSON struct {
	HouseholdLedgerID string `json:"household_ledger_id"`
}

// requireUser reads the caller from the token, or writes 401.
func requireUser(w http.ResponseWriter, r *http.Request) (int64, bool) {
	user_id, ok := UserIDFromContext(r.Context())
	if !ok {
		WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", "認証情報が不正です")
	}
	return user_id, ok
}

// CreateHouseholdHandler handles POST /household.
func CreateHouseholdHandler(repo householdRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := requireUser(w, r)
		if !ok {
			return
		}
		var household_request struct {
			Name *string `json:"name"`
		}
		if !decodeCommandBody(w, r, &household_request) {
			return
		}
		if validation_message := validateRequiredName(household_request.Name); validation_message != "" {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", string(validation_message))
			return
		}
		household_id, err := repo.CreateHousehold(r.Context(), user_id, *household_request.Name)
		if err != nil {
			writeCommandError(w, r, err)
			return
		}
		WriteJSON(w, http.StatusCreated, householdLedgerJSON{HouseholdLedgerID: household_id})
	}
}

type invitationJSON struct {
	ID        string    `json:"id"`
	Token     string    `json:"token,omitempty"`
	ShortCode string    `json:"short_code"`
	CreatedBy int64     `json:"created_by,omitempty"`
	ExpiresAt time.Time `json:"expires_at"`
}

// CreateHouseholdInvitationHandler handles POST /household/invitations. The
// token is returned only in this response.
func CreateHouseholdInvitationHandler(repo householdRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := requireUser(w, r)
		if !ok {
			return
		}
		created_invitation, err := repo.CreateHouseholdInvitation(r.Context(), user_id)
		if err != nil {
			writeCommandError(w, r, err)
			return
		}
		WriteJSON(w, http.StatusCreated, invitationJSON{
			ID:        created_invitation.ID,
			Token:     created_invitation.Token,
			ShortCode: created_invitation.ShortCode,
			ExpiresAt: created_invitation.ExpiresAt.UTC(),
		})
	}
}

// ListHouseholdInvitationsHandler handles GET /household/invitations.
func ListHouseholdInvitationsHandler(repo householdRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := requireUser(w, r)
		if !ok {
			return
		}
		open_invitations, err := repo.ListHouseholdInvitations(r.Context(), user_id)
		if err != nil {
			writeCommandError(w, r, err)
			return
		}
		invitations_json := make([]invitationJSON, 0, len(open_invitations))
		for _, open_invitation := range open_invitations {
			invitations_json = append(invitations_json, invitationJSON{
				ID:        open_invitation.ID,
				ShortCode: open_invitation.ShortCode,
				CreatedBy: open_invitation.CreatedBy,
				ExpiresAt: open_invitation.ExpiresAt.UTC(),
			})
		}
		WriteJSON(w, http.StatusOK, map[string]any{"invitations": invitations_json})
	}
}

// RevokeHouseholdInvitationHandler handles DELETE /household/invitations/{id}.
func RevokeHouseholdInvitationHandler(repo householdRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := requireUser(w, r)
		if !ok {
			return
		}
		invitation_id, ok := pathUUID(w, r)
		if !ok {
			return
		}
		if err := repo.RevokeHouseholdInvitation(r.Context(), user_id, invitation_id); err != nil {
			writeCommandError(w, r, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// isWellFormedShortCode reports whether a normalized code can be one the server
// issued.
func isWellFormedShortCode(short_code string) bool {
	if len(short_code) != repository.ShortCodeLength {
		return false
	}
	for _, code_rune := range short_code {
		if !strings.ContainsRune(repository.ShortCodeAlphabet, code_rune) {
			return false
		}
	}
	return true
}

// JoinHouseholdHandler handles POST /household/join with either the link's
// token or the short code.
func JoinHouseholdHandler(repo householdRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := requireUser(w, r)
		if !ok {
			return
		}
		var join_request struct {
			Token *string `json:"token"`
			Code  *string `json:"code"`
		}
		if !decodeCommandBody(w, r, &join_request) {
			return
		}
		var join_input repository.JoinInput
		switch {
		case (join_request.Token == nil) == (join_request.Code == nil):
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "tokenかcodeのどちらか一方を指定してください")
			return
		case join_request.Token != nil:
			if *join_request.Token == "" || len(*join_request.Token) > maxInvitationTokenLength {
				WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "tokenが不正です")
				return
			}
			join_input.Token = *join_request.Token
		default:
			short_code := repository.NormalizeShortCode(*join_request.Code)
			if !isWellFormedShortCode(short_code) {
				WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "招待コードは8文字の英数字で入力してください")
				return
			}
			join_input.ShortCode = short_code
		}
		household_id, err := repo.JoinHousehold(r.Context(), user_id, join_input)
		if err != nil {
			writeCommandError(w, r, err)
			return
		}
		WriteJSON(w, http.StatusOK, householdLedgerJSON{HouseholdLedgerID: household_id})
	}
}

// serveNoContentCommand runs a household command without a body and answers 204.
func serveNoContentCommand(w http.ResponseWriter, r *http.Request, run_command func(context.Context, int64) error) {
	user_id, ok := requireUser(w, r)
	if !ok {
		return
	}
	if err := run_command(r.Context(), user_id); err != nil {
		writeCommandError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// LeaveHouseholdHandler handles POST /household/leave.
func LeaveHouseholdHandler(repo householdRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		serveNoContentCommand(w, r, repo.LeaveHousehold)
	}
}

// DissolveHouseholdHandler handles POST /household/dissolve.
func DissolveHouseholdHandler(repo householdRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		serveNoContentCommand(w, r, repo.DissolveHousehold)
	}
}

// RemoveHouseholdMemberHandler handles DELETE /household/members/{user_id}.
func RemoveHouseholdMemberHandler(repo householdRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		member_id, err := strconv.ParseInt(r.PathValue("user_id"), 10, 32)
		if err != nil || member_id < 1 {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "user_idが不正です")
			return
		}
		serveNoContentCommand(w, r, func(ctx context.Context, user_id int64) error {
			return repo.RemoveHouseholdMember(ctx, user_id, member_id)
		})
	}
}

// PutHouseholdAllowanceHandler handles PUT /household/allowances: a member's
// allowance from a month on.
func PutHouseholdAllowanceHandler(repo householdRepository) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user_id, ok := requireUser(w, r)
		if !ok {
			return
		}
		var allowance_request struct {
			MemberID      *int64  `json:"member_id"`
			EffectiveFrom *string `json:"effective_from"`
			Amount        *int32  `json:"amount"`
		}
		if !decodeCommandBody(w, r, &allowance_request) {
			return
		}
		var validation_message string
		switch {
		case allowance_request.MemberID == nil || *allowance_request.MemberID < 1:
			validation_message = "member_idは必須です"
		case allowance_request.EffectiveFrom == nil || !syncrules.IsYearMonth(*allowance_request.EffectiveFrom):
			validation_message = "effective_fromはYYYY-MM形式で指定してください"
		case allowance_request.Amount == nil || *allowance_request.Amount < 0:
			validation_message = "amountは0以上の整数で指定してください"
		}
		if validation_message != "" {
			WriteError(w, http.StatusBadRequest, "BAD_REQUEST", validation_message)
			return
		}
		written_row, err := repo.PutHouseholdAllowance(r.Context(), user_id, *allowance_request.MemberID, *allowance_request.EffectiveFrom, *allowance_request.Amount)
		if err != nil {
			writeCommandError(w, r, err)
			return
		}
		WriteJSON(w, http.StatusOK, pulledRowJSON(*written_row))
	}
}
