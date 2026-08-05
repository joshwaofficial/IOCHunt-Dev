import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useInstance } from '../context/InstanceContext';
import { useAuth } from '../context/AuthContext';

export default function SetupWizard() {
  const navigate = useNavigate();
  const { refreshInstanceInfo } = useInstance();
  const { setUser } = useAuth();

  const [step, setStep] = useState(1); // 1 = Role Select, 2 = Credentials / Connection
  const [selectedRole, setSelectedRole] = useState('central_server'); // 'central_server' | 'aggregator'
  const [loading, setLoading] = useState(false);

  // Form Fields
  const [instanceName, setInstanceName] = useState('IOC Hunt Central Command Hub');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminEmail, setAdminEmail] = useState('admin@defsecone.local');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [centralServerUrl, setCentralServerUrl] = useState('https://localhost:4001');

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    if (role === 'central_server') {
      setInstanceName('IOC Hunt Central Command Hub');
      setAdminUsername('admin');
    } else {
      setInstanceName('Branch Aggregator Node');
      setAdminUsername('admin_branch2');
    }
  };

  const handleNext = (e) => {
    e.preventDefault();
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (selectedRole === 'central_server') {
      if (!adminUsername.trim() || !adminPassword) {
        toast.error('Please enter admin username and password');
        return;
      }
      if (adminPassword !== confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
      if (adminPassword.length < 6) {
        toast.error('Password must be at least 6 characters long');
        return;
      }
    } else {
      if (!centralServerUrl.trim() || !adminUsername.trim() || !adminPassword) {
        toast.error('Please complete Central Server URL, Username, and Password');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await axios.post('/api/instance/setup', {
        mode: selectedRole,
        instance_name: instanceName,
        admin_username: adminUsername.trim(),
        admin_email: adminEmail.trim(),
        admin_password: adminPassword,
        central_server_url: selectedRole === 'aggregator' ? centralServerUrl.trim() : undefined
      });

      toast.success(res.data.message || 'System initialized successfully!');

      if (res.data.token) {
        localStorage.setItem('iochunt_token', res.data.token);
      }
      if (res.data.user) {
        localStorage.setItem('iochunt_user', JSON.stringify(res.data.user));
        setUser(res.data.user);
      }

      await refreshInstanceInfo();

      // Proceed to authenticated dashboard
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 500);
    } catch (err) {
      console.error('[Setup Error]', err);
      toast.error(err.response?.data?.error || 'Failed to complete setup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-wizard-page">
      <style>{`
        .setup-wizard-page {
          --bg: #060814;
          --surface: rgba(13, 18, 36, 0.85);
          --card-bg: rgba(18, 26, 52, 0.6);
          --card-hover: rgba(30, 42, 80, 0.8);
          --border: rgba(255, 255, 255, 0.08);
          --border-active: #3b82f6;
          --text: #f1f5f9;
          --muted: #64748b;
          --accent: #2563eb;
          --success: #10b981;
          --mono: 'Space Mono', monospace;
          --sans: 'Inter', -apple-system, sans-serif;

          font-family: var(--sans);
          background: radial-gradient(circle at 50% 10%, #172554 0%, #060814 80%);
          color: var(--text);
          min-height: 100vh;
          width: 100vw;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          box-sizing: border-box;
          position: fixed;
          top: 0;
          left: 0;
          overflow-y: auto;
          z-index: 9999;
        }

        .setup-wizard-page * {
          box-sizing: border-box;
        }

        .setup-container {
          width: 100%;
          max-width: 680px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 36px 40px;
          box-shadow: 0 30px 90px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(24px);
          animation: modalAppear 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
        }
        @keyframes modalAppear {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .setup-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--border);
        }
        .setup-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: linear-gradient(135deg, #1d4ed8, #3b82f6);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 24px rgba(37, 99, 235, 0.4);
        }
        .setup-title {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: #fff;
        }
        .setup-sub {
          font-size: 12px;
          color: var(--muted);
          margin-top: 2px;
        }

        .progress-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 28px;
        }
        .progress-step {
          flex: 1;
          height: 4px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.1);
          transition: all 0.3s;
        }
        .progress-step.active {
          background: #3b82f6;
          box-shadow: 0 0 12px rgba(59, 130, 246, 0.8);
        }

        .role-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 28px;
        }
        .role-card {
          background: var(--card-bg);
          border: 2px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
          padding: 22px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          position: relative;
        }
        .role-card:hover {
          background: var(--card-hover);
          border-color: rgba(59, 130, 246, 0.4);
          transform: translateY(-2px);
        }
        .role-card.selected {
          border-color: var(--border-active);
          background: rgba(37, 99, 235, 0.12);
          box-shadow: 0 10px 30px rgba(37, 99, 235, 0.25);
        }
        .role-card-badge {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .role-card.selected .role-card-badge {
          border-color: #3b82f6;
          background: #3b82f6;
        }
        .role-card-badge .material-symbols-outlined {
          font-size: 14px;
          color: #fff;
        }

        .role-card-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
        }
        .role-card.selected .role-card-icon {
          background: #2563eb;
          color: #fff;
        }
        .role-card-title {
          font-size: 15px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 6px;
        }
        .role-card-desc {
          font-size: 12px;
          color: var(--muted);
          line-height: 1.4;
        }

        .field-group {
          margin-bottom: 16px;
        }
        .field-group label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.8px;
          margin-bottom: 6px;
        }
        .input-box {
          position: relative;
        }
        .input-box .material-symbols-outlined {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 18px;
          color: var(--muted);
          pointer-events: none;
        }
        .input-box input {
          width: 100%;
          padding: 11px 14px 11px 44px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: var(--text);
          font-size: 13px;
          outline: none;
          transition: all 0.2s;
        }
        .input-box input:focus {
          border-color: #3b82f6;
          background: rgba(59, 130, 246, 0.05);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
        }

        .btn-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 28px;
          gap: 12px;
        }
        .btn-secondary {
          padding: 12px 20px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: var(--text);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .btn-primary {
          flex: 1;
          padding: 13px 24px;
          background: linear-gradient(135deg, #1d4ed8, #2563eb);
          border: none;
          border-radius: 10px;
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 28px rgba(37, 99, 235, 0.5);
        }
        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .info-tip {
          background: rgba(59, 130, 246, 0.08);
          border: 1px solid rgba(59, 130, 246, 0.2);
          border-radius: 10px;
          padding: 12px 16px;
          margin-bottom: 20px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 12px;
          color: #93c5fd;
          line-height: 1.4;
        }
      `}</style>

      <div className="setup-container">
        {/* Header */}
        <div className="setup-header">
          <div className="setup-icon">
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#fff' }}>settings_suggest</span>
          </div>
          <div>
            <div className="setup-title">Initial Instance Setup</div>
            <div className="setup-sub">IOC Hunt Security Platform Deployment Wizard</div>
          </div>
        </div>

        {/* Step Indicators */}
        <div className="progress-bar">
          <div className="progress-step active" />
          <div className={`progress-step ${step >= 2 ? 'active' : ''}`} />
        </div>

        {/* STEP 1: Select Instance Role */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Select System Deployment Role</h2>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
              Choose whether this server instance acts as the Central Command Hub or a Branch Aggregator.
            </p>

            <div className="role-grid">
              <div
                className={`role-card ${selectedRole === 'central_server' ? 'selected' : ''}`}
                onClick={() => handleRoleSelect('central_server')}
              >
                <div className="role-card-badge">
                  {selectedRole === 'central_server' && (
                    <span className="material-symbols-outlined">check</span>
                  )}
                </div>
                <div className="role-card-icon">
                  <span className="material-symbols-outlined">corporate_fare</span>
                </div>
                <div className="role-card-title">Central Server</div>
                <div className="role-card-desc">
                  Primary headquarters command hub. Manages multi-branch aggregators, centralized threat intelligence, and company policies.
                </div>
              </div>

              <div
                className={`role-card ${selectedRole === 'aggregator' ? 'selected' : ''}`}
                onClick={() => handleRoleSelect('aggregator')}
              >
                <div className="role-card-badge">
                  {selectedRole === 'aggregator' && (
                    <span className="material-symbols-outlined">check</span>
                  )}
                </div>
                <div className="role-card-icon">
                  <span className="material-symbols-outlined">hub</span>
                </div>
                <div className="role-card-title">Branch Aggregator</div>
                <div className="role-card-desc">
                  Remote branch edge node. Aggregates local endpoint agents with an isolated local database and securely syncs to Central HQ.
                </div>
              </div>
            </div>

            <div className="btn-row">
              <div />
              <button className="btn-primary" onClick={handleNext}>
                Continue Configuration
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Role Details Configuration */}
        {step === 2 && (
          <form onSubmit={handleSubmit}>
            {selectedRole === 'central_server' ? (
              <>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Configure Primary Super Administrator</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
                  Set up the master administrator credentials for your Central Command Hub.
                </p>

                <div className="field-group">
                  <label>Instance Display Name</label>
                  <div className="input-box">
                    <span className="material-symbols-outlined">badge</span>
                    <input
                      type="text"
                      value={instanceName}
                      onChange={(e) => setInstanceName(e.target.value)}
                      placeholder="e.g. IOC Hunt Central Hub"
                      required
                    />
                  </div>
                </div>

                <div className="field-group">
                  <label>Admin Username</label>
                  <div className="input-box">
                    <span className="material-symbols-outlined">person</span>
                    <input
                      type="text"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      placeholder="admin"
                      required
                    />
                  </div>
                </div>

                <div className="field-group">
                  <label>Admin Password</label>
                  <div className="input-box">
                    <span className="material-symbols-outlined">lock</span>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Enter secure master password (min 6 chars)"
                      required
                    />
                  </div>
                </div>

                <div className="field-group">
                  <label>Confirm Password</label>
                  <div className="input-box">
                    <span className="material-symbols-outlined">check_circle</span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      required
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Connect Branch Node to Central Server</h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
                  Enter the Central Server endpoint URL and the Branch Admin credentials provided by HQ.
                </p>

                <div className="info-tip">
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#60a5fa' }}>info</span>
                  <div>
                    The Branch Node will automatically verify credentials against the Central Server and initialize its own isolated local PostgreSQL database.
                  </div>
                </div>

                <div className="field-group">
                  <label>Central Server URL & Port</label>
                  <div className="input-box">
                    <span className="material-symbols-outlined">dns</span>
                    <input
                      type="url"
                      value={centralServerUrl}
                      onChange={(e) => setCentralServerUrl(e.target.value)}
                      placeholder="https://central-server-ip:4001"
                      required
                    />
                  </div>
                </div>

                <div className="field-group">
                  <label>Branch Admin Username</label>
                  <div className="input-box">
                    <span className="material-symbols-outlined">person</span>
                    <input
                      type="text"
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      placeholder="e.g. admin_branch2"
                      required
                    />
                  </div>
                </div>

                <div className="field-group">
                  <label>Branch Admin Password</label>
                  <div className="input-box">
                    <span className="material-symbols-outlined">key</span>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Branch credentials configured in Central Server"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <div className="btn-row">
              <button type="button" className="btn-secondary" onClick={handleBack}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
                Back
              </button>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? (
                  'Initializing & Connecting...'
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>rocket_launch</span>
                    {selectedRole === 'central_server' ? 'Initialize Central Server' : 'Verify & Launch Branch Node'}
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
