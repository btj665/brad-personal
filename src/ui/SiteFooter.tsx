// The link back to the studio's site, shown under the sign-in card and at the
// bottom of the floor. Privacy goes straight to The Tables' own section.

const SITE = 'https://baldyshilltop.com'

export function SiteFooter() {
  return (
    <footer className="sitefoot">
      <a href={`${SITE}/`} target="_blank" rel="noopener noreferrer">
        Baldy's Hilltop
      </a>
      <a href={`${SITE}/privacy#the-tables`} target="_blank" rel="noopener noreferrer">
        Privacy
      </a>
      <a href={`${SITE}/terms`} target="_blank" rel="noopener noreferrer">
        Terms
      </a>
    </footer>
  )
}
