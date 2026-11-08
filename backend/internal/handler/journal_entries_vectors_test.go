package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/utibori-jp/atoikura/backend/internal/testutil"
)

// expandVectorValue turns {"repeat": s, "count": n} into s repeated n times and
// returns every other value unchanged.
func expandVectorValue(raw_value any) any {
	repeat_spec, is_object := raw_value.(map[string]any)
	if !is_object {
		return raw_value
	}
	repeated_text, _ := repeat_spec["repeat"].(string)
	repeat_count, _ := repeat_spec["count"].(float64)
	return strings.Repeat(repeated_text, int(repeat_count))
}

// The shared vectors in testdata/logic are also run by the client validation tests
// (frontend/src/logic), so the server and the client reject the same inputs.
func TestCreateJournalEntryHandlerSharedVectors(t *testing.T) {
	vector_bytes, err := os.ReadFile(filepath.Join("..", "..", "..", "testdata", "logic", "journal_entry_validation.json"))
	if err != nil {
		t.Fatalf("reading shared vectors: %v", err)
	}
	var vector_file struct {
		Cases []struct {
			Name     string         `json:"name"`
			Input    map[string]any `json:"input"`
			Expected struct {
				Valid   bool   `json:"valid"`
				Message string `json:"message"`
			} `json:"expected"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(vector_bytes, &vector_file); err != nil {
		t.Fatalf("decoding shared vectors: %v", err)
	}

	for _, validation_case := range vector_file.Cases {
		t.Run(validation_case.Name, func(t *testing.T) {
			request_body := map[string]any{}
			for field_name, raw_value := range validation_case.Input {
				if field_name == "category" {
					if raw_value == "present" {
						request_body["category_id"] = 1
					}
					continue
				}
				request_body[field_name] = expandVectorValue(raw_value)
			}

			request := authCtx(testutil.NewRequest(t, http.MethodPost, "/journal-entries", request_body), 1)
			recorder := testutil.NewRecorder()
			CreateJournalEntryHandler(&fakeJournalRepo{})(recorder, request)

			if validation_case.Expected.Valid {
				testutil.AssertStatus(t, recorder, http.StatusCreated)
				return
			}
			testutil.AssertStatus(t, recorder, http.StatusBadRequest)
			var error_body struct {
				Message string `json:"message"`
			}
			testutil.DecodeJSON(t, recorder, &error_body)
			if error_body.Message != validation_case.Expected.Message {
				t.Errorf("message = %q, want %q", error_body.Message, validation_case.Expected.Message)
			}
		})
	}
}
