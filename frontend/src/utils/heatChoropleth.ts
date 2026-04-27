export function heatChoropleth(lst: number | null | undefined): string {
  if (lst == null) return '#a50026'
  if (lst <= 20) return '#313695'
  if (lst <= 25) return '#4575b4'
  if (lst <= 30) return '#74add1'
  if (lst <= 35) return '#abd9e9'
  if (lst <= 40) return '#fee090'
  if (lst <= 45) return '#fdae61'
  if (lst <= 50) return '#f46d43'
  if (lst <= 55) return '#d73027'
  return '#a50026'
}
