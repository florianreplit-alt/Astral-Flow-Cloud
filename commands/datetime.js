const { resolveTimezone } = require("../utils/countryTimezones");

function getTime() {
  const now = new Date();
  return `🕒 *Current Time*\n${now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;
}

function getDate() {
  const now = new Date();
  return `📅 *Today's Date*\n${now.toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })}`;
}

function getTimeForCountry(countryInput) {
  if (!countryInput || !countryInput.trim()) {
    return "⚠️ Usage: .time japan";
  }

  const timezone = resolveTimezone(countryInput);
  if (!timezone) {
    return `⚠️ I don't have a timezone for "${countryInput}" yet. Try a common country name like Japan, UK, USA, Nigeria, etc.`;
  }

  const now = new Date();
  const time = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: timezone,
  });
  const date = now.toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  });

  const countryName = countryInput.trim().replace(/\b\w/g, (c) => c.toUpperCase());

  return `🕒 *Time in ${countryName}*\n${time}\n📅 ${date}`;
}

module.exports = { getTime, getDate, getTimeForCountry };
