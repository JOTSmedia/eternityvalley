export const ANNIVERSARY_GIFTS = [
  { id: 'anniv_candle', name: 'Anniversary Eternal Flame', price: 799, emoji: '🕯️' },
  { id: 'anniv_wreath', name: 'Anniversary Remembrance Wreath', price: 1499, emoji: '💐' },
  { id: 'anniv_star', name: 'Anniversary Star Dedication', price: 2499, emoji: '⭐' }
];

export function checkAnniversaries(ownedPlots) {
  const upcoming = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const [plotId, plotData] of Object.entries(ownedPlots || {})) {
    const memorial = plotData.memorial;
    if (!memorial) continue;

    const petName = memorial.petName || 'Your Pet';
    const species = memorial.species || 'pet';
    let passingDateStr = memorial.petProfile?.passing;
    
    if (!passingDateStr && memorial.years) {
      const match = memorial.years.match(/(\d{4}-\d{2}-\d{2})/);
      if (match) {
        passingDateStr = match[1];
      }
    }

    if (!passingDateStr) continue;

    const passingDate = new Date(passingDateStr);
    if (isNaN(passingDate.getTime())) continue;

    const annivThisYear = new Date(today.getFullYear(), passingDate.getMonth(), passingDate.getDate());
    
    let nextAnniv = annivThisYear;
    if (annivThisYear < today) {
      nextAnniv = new Date(today.getFullYear() + 1, passingDate.getMonth(), passingDate.getDate());
    }

    const diffTime = nextAnniv.getTime() - today.getTime();
    const daysUntil = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (daysUntil <= 7) {
      const yearsAgo = nextAnniv.getFullYear() - passingDate.getFullYear();
      upcoming.push({
        plotId,
        petName,
        species,
        crossingDate: passingDateStr,
        daysUntil,
        yearsAgo
      });
    }
  }

  return upcoming;
}

export function generateICS(petName, date) {
  const d = new Date(date);
  const pad = n => n.toString().padStart(2, '0');
  
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const dateString = `${year}${month}${day}`;

  const nextD = new Date(d);
  nextD.setDate(nextD.getDate() + 1);
  const nextYear = nextD.getFullYear();
  const nextMonth = pad(nextD.getMonth() + 1);
  const nextDay = pad(nextD.getDate());
  const nextDateString = `${nextYear}${nextMonth}${nextDay}`;

  const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Eternity Valley//Pet Memorial//EN
BEGIN:VEVENT
DTSTART;VALUE=DATE:${dateString}
DTEND;VALUE=DATE:${nextDateString}
SUMMARY:Remembrance Anniversary for ${petName}
DESCRIPTION:Take a moment to visit Eternity Valley and remember ${petName}.
END:VEVENT
END:VCALENDAR`;

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  return URL.createObjectURL(blob);
}
