package handler

import "time"

var jst = time.FixedZone("Asia/Tokyo", 9*60*60)

func toJST(t time.Time) string {
	return t.In(jst).Format(time.RFC3339)
}
