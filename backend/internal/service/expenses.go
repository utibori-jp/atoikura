package service

import (
	"math"
	"time"
)

type DailyEntry struct {
	Date     string `json:"date"`
	Food     int32  `json:"food"`
	Other    int32  `json:"other"`
	Total    int32  `json:"total"`
	IsActual bool   `json:"is_actual"`
}

func BuildDailyEntries(
	actualSums map[string]map[string]int32,
	firstDay time.Time,
	daysInMonth int,
	todayStr string,
	todayDayNum int,
	isPastMonth bool,
) []DailyEntry {
	days := make([]DailyEntry, daysInMonth)

	var cumulativeFood, cumulativeOther int32
	var cumulativeFoodToday, cumulativeOtherToday int32
	paceComputed := false
	var paceFood, paceOther float64

	for dayNum := 1; dayNum <= daysInMonth; dayNum++ {
		dateStr := firstDay.AddDate(0, 0, dayNum-1).Format("2006-01-02")

		if isPastMonth || dateStr <= todayStr {
			cumulativeFood += actualSums[dateStr]["food"]
			cumulativeOther += actualSums[dateStr]["other"]

			days[dayNum-1] = DailyEntry{
				Date:     dateStr,
				Food:     cumulativeFood,
				Other:    cumulativeOther,
				Total:    cumulativeFood + cumulativeOther,
				IsActual: true,
			}

			if !isPastMonth && dateStr == todayStr {
				cumulativeFoodToday = cumulativeFood
				cumulativeOtherToday = cumulativeOther
			}
		} else {
			if !paceComputed {
				daysElapsed := todayDayNum
				if daysElapsed > 0 && (cumulativeFoodToday != 0 || cumulativeOtherToday != 0) {
					paceFood = float64(cumulativeFoodToday) / float64(daysElapsed)
					paceOther = float64(cumulativeOtherToday) / float64(daysElapsed)
				}
				paceComputed = true
			}

			daysAhead := dayNum - todayDayNum
			forecastFood := cumulativeFoodToday + int32(math.Floor(paceFood*float64(daysAhead)))
			forecastOther := cumulativeOtherToday + int32(math.Floor(paceOther*float64(daysAhead)))

			days[dayNum-1] = DailyEntry{
				Date:     dateStr,
				Food:     forecastFood,
				Other:    forecastOther,
				Total:    forecastFood + forecastOther,
				IsActual: false,
			}
		}
	}

	return days
}
