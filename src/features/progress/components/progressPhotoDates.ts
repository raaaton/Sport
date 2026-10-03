export function formatProgressPhotoMonth(dateString: string): string {
  const [year = '2000', month = '1', day = '1'] = dateString.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

export function formatProgressPhotoDate(dateString: string): string {
  const [year = '2000', month = '1', day = '1'] = dateString.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('fr-FR', { dateStyle: 'long' });
}
