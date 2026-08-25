import React, { useState } from 'react';
import AllEventsModal from './AllEventsModal';

const ThreatSummaryCards = ({ stats }) => {
  const [modalFilter, setModalFilter] = useState(null);

  if (!stats) return null;

  const total = stats.total || 0;
  const critical = stats.bySev?.find(s => s.severity === 'critical')?.n || 0;
  const high = stats.bySev?.find(s => s.severity === 'high')?.n || 0;
  const medium = stats.bySev?.find(s => s.severity === 'medium')?.n || 0;
  
  const idThreats = stats.byCat
    ?.filter(c => c.category === 'DOMAIN' || c.category === 'ADCS')
    .reduce((sum, c) => sum + parseInt(c.n, 10), 0) || 0;
  const netDrops = stats.byCat?.find(c => c.category === 'NETWORK')?.n || 0;
  
  const activeMachines = stats.machines?.length || 0;
  const chains = stats.chains?.length || 0;

  const handleCardClick = (type) => {
    setModalFilter(type);
  };

  return (
    <>
      <div className="sgrid">
        <div className="sc info" onClick={() => handleCardClick('')}>
          <div className="sc-top">
            <div className="sc-icon-wrap"><span className="material-symbols-outlined" style={{ fontSize: '20px' }}>security</span></div>
            <div className="sc-title">Security Events</div>
          </div>
          <div>
            <div className="sn">{total.toLocaleString()}</div>
            <div className="sc-sub"><div className="sc-pulse"></div> Active tracking</div>
          </div>
        </div>

        <div className="sc critical" onClick={() => handleCardClick('critical')}>
          <div className="sc-top">
            <div className="sc-icon-wrap"><span className="material-symbols-outlined" style={{ fontSize: '20px' }}>warning</span></div>
            <div className="sc-title">Critical</div>
          </div>
          <div>
            <div className="sn">{critical.toLocaleString()}</div>
            <div className="sc-sub"><div className="sc-pulse"></div> Action required</div>
          </div>
        </div>

        <div className="sc high" onClick={() => handleCardClick('high')}>
          <div className="sc-top">
            <div className="sc-icon-wrap"><span className="material-symbols-outlined" style={{ fontSize: '20px' }}>error</span></div>
            <div className="sc-title">High</div>
          </div>
          <div>
            <div className="sn">{high.toLocaleString()}</div>
            <div className="sc-sub"><div className="sc-pulse"></div> Elevated risk</div>
          </div>
        </div>

        <div className="sc medium" onClick={() => handleCardClick('medium')}>
          <div className="sc-top">
            <div className="sc-icon-wrap"><span className="material-symbols-outlined" style={{ fontSize: '20px' }}>info</span></div>
            <div className="sc-title">Medium</div>
          </div>
          <div>
            <div className="sn">{medium.toLocaleString()}</div>
            <div className="sc-sub"><div className="sc-pulse"></div> Under review</div>
          </div>
        </div>
        
        <div className="sc ad" onClick={() => handleCardClick('ad')}>
          <div className="sc-top">
            <div className="sc-icon-wrap"><span className="material-symbols-outlined" style={{ fontSize: '20px' }}>key</span></div>
            <div className="sc-title">AD Attacks</div>
          </div>
          <div>
            <div className="sn">{idThreats.toLocaleString()}</div>
            <div className="sc-sub"><div className="sc-pulse"></div> Identity threats</div>
          </div>
        </div>

        <div className="sc low" onClick={() => handleCardClick('blocked')}>
          <div className="sc-top">
            <div className="sc-icon-wrap"><span className="material-symbols-outlined" style={{ fontSize: '20px' }}>block</span></div>
            <div className="sc-title">Blocked</div>
          </div>
          <div>
            <div className="sn">{netDrops.toLocaleString()}</div>
            <div className="sc-sub"><div className="sc-pulse"></div> Network drops</div>
          </div>
        </div>

        <div className="sc info" onClick={() => handleCardClick('machines')}>
          <div className="sc-top">
            <div className="sc-icon-wrap"><span className="material-symbols-outlined" style={{ fontSize: '20px' }}>computer</span></div>
            <div className="sc-title">Machines</div>
          </div>
          <div>
            <div className="sn">{activeMachines.toLocaleString()}</div>
            <div className="sc-sub"><div className="sc-pulse"></div> Active agents</div>
          </div>
        </div>

        <div className="sc info" onClick={() => handleCardClick('incidents')}>
          <div className="sc-top">
            <div className="sc-icon-wrap"><span className="material-symbols-outlined" style={{ fontSize: '20px' }}>emergency</span></div>
            <div className="sc-title">Incidents</div>
          </div>
          <div>
            <div className="sn">{chains.toLocaleString()}</div>
            <div className="sc-sub"><div className="sc-pulse"></div> Correlated chains</div>
          </div>
        </div>
      </div>

      <AllEventsModal 
        isOpen={modalFilter !== null} 
        onClose={() => setModalFilter(null)} 
        filterType={modalFilter} 
      />
    </>
  );
};

export default React.memo(ThreatSummaryCards);
