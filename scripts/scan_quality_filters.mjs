export function isSearchResultNoise(job = {}) {
  const title = String(job.title || '').toLowerCase();
  const url = String(job.url || '').toLowerCase();
  if (/linkedin\.com\/jobs\/search|indeed\.com\/q-|glassdoor\.com\/salaries|glassdoor\.com\/career|ziprecruiter\.com\/jobs-search|simplyhired\.com\/search/.test(url)) return true;
  if (/\b\d{2,}[,+]?\s+(director|chief|partnership|alliances|operations|revops).+\bjobs\b/.test(title)) return true;
  if (/\b(jobs in|jobs, employment|job search|salaries|salary|ultimate guide|what is a|hiring now)\b/.test(title)) return true;
  return false;
}

export function isQuickReject(job = {}) {
  const title = String(job.title || '').toLowerCase();
  const location = String(job.location || '').toLowerCase();
  const company = String(job.company || '').toLowerCase();
  if (/\b(swooped|ladders|jobot|cybercoders|robert half|dice|motion recruitment|recruiting|staffing|talent)\b/.test(company)) return true;
  if (/\b(business development executive|business development rep|business development representative|sales executive|sales operations business partner|account executive|sourcer|talent partner|product owner|product marketing|partner marketing|brand partnerships|content|customer activation|customer referral|revenue enablement|strategist|consultant|staff domain expert|future opportunities)\b/.test(title)) return true;
  if (/\b(marketing|finance|financial|people partner|fraud|abuse)\b/.test(title)) return true;
  if (/\bmanager\b/.test(title) && !/\b(senior|sr\.?|director|head|vp|vice president)\b/.test(title)) return true;
  if (/\b(tokyo|japan|singapore|dublin|london|emea|uk|madrid|spain)\b/.test(location) && !/\b(remote|united states|usa|u\.s\.|us-remote|remote - us)\b/.test(location)) return true;
  return false;
}
