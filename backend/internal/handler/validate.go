package handler

import (
	"net/http"
	"regexp"
	"strconv"
)

var (
	yearMonthPattern = regexp.MustCompile(`^\d{4}-\d{2}$`)
	datePattern      = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

func parsePathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id < 1 {
		WriteError(w, http.StatusBadRequest, "BAD_REQUEST", "idが不正です")
		return 0, false
	}
	return id, true
}
