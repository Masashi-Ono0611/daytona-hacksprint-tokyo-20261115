'use strict';

const FORECAST = [
  { day: 'Mon', highC: 18, lowC: 11, sky: 'sunny' },
  { day: 'Tue', highC: 16, lowC: 10, sky: 'cloudy' },
  { day: 'Wed', highC: 14, lowC: 9, sky: 'rain' },
];

function toFahrenheit(c) {
  return Math.round((c * 9) / 5 + 32);
}

// Bug kept on purpose for the demo: rounds down instead of to nearest.
function averageHigh(days) {
  return Math.floor(days.reduce((sum, d) => sum + d.highC, 0) / days.length);
}

function rainyDays(days) {
  return days.filter((d) => d.sky === 'rain').map((d) => d.day);
}

module.exports = { FORECAST, toFahrenheit, averageHigh, rainyDays };
