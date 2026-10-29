import { useEffect, useRef } from 'react';

const ADSENSE_SCRIPT_ID = 'google-adsense-script';

const PUBLISHER_ID = 'ca-pub-1779270093046338';

const ADSENSE_SCRIPT_URL =
  `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUBLISHER_ID}`;

export function AdSense() {
  const adRef = useRef(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || !adRef.current) return;

    initialized.current = true;

    // Load the AdSense script if it hasn't already been added.
    if (!document.getElementById(ADSENSE_SCRIPT_ID)) {
      const script = document.createElement('script');

      script.id = ADSENSE_SCRIPT_ID;
      script.async = true;
      script.src = ADSENSE_SCRIPT_URL;
      script.crossOrigin = 'anonymous';

      document.head.appendChild(script);
    }

    // Request an ad for this ad unit.
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      console.error('AdSense initialization failed:', error);
    }
  }, []);

  return (
    <aside className="adsense-bottom" aria-label="Advertisement">
      <span className="ad-label">Advertisement</span>

      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{
          display: 'block',
          width: '100%',
          minHeight: '100px',
        }}
        data-ad-client={PUBLISHER_ID}
        data-ad-slot="YOUR_AD_SLOT_ID"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}