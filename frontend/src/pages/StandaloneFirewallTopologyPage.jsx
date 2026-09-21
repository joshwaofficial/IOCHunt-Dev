import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';

const FirewallTopology = lazy(() => import('../components/FirewallTopology'));

/**
 * Dedicated Standalone Firewall Topology Page
 *
 * Provides a pure 100% full-screen view (100vw × 100vh) without
 * application sidebar or navbar chrome, giving maximum canvas
 * area for Cytoscape graphs and the entity inspector drawer.
 */
export default function StandaloneFirewallTopologyPage() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg)',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 99999
      }}
    >
      <Suspense
        fallback={
          <div
            style={{
              width: '100vw',
              height: '100vh',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#090d16',
              color: '#94a3b8',
              fontFamily: 'var(--sans)',
              fontSize: '14px',
              gap: '12px'
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                border: '3px solid rgba(6,182,212,0.2)',
                borderTopColor: '#06b6d4',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}
            />
            Loading Fullscreen Firewall Topology...
          </div>
        }
      >
        <FirewallTopology
          standalone={true}
          onExit={() => navigate('/firewall')}
        />
      </Suspense>
    </div>
  );
}
