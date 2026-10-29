import { useEffect } from 'react';

const ADSENSE_SCRIPT_ID = 'google-adsense-script';
const ADSENSE_SCRIPT_URL = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1779270093046338';

export function AdSense() {
  useEffect(() => {
    if (document.getElementById(ADSENSE_SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = ADSENSE_SCRIPT_ID;
    script.async = true;
    script.src = ADSENSE_SCRIPT_URL;
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
  }, []);

  return (
    <aside className="adsense-bottom" aria-label="Advertisement">
      <span>Advertisement</span>
    </aside>
  );
}
