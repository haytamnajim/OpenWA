import { Suspense } from 'react';
import { lazyWithRetry as lazy } from '../utils/lazyWithRetry';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare,
  Send,
  Webhook,
  Activity,
  Loader2,
  Smartphone,
  Phone,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  QrCode,
  Eye,
  Power,
  Hash,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRole } from '../hooks/useRole';
import { useToast } from '../hooks/useToast';
import {
  useSessionsQuery,
  useSessionStatsQuery,
  useWebhooksQuery,
  useStopSessionMutation,
  useStatsOverviewQuery,
} from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { isSessionStarted } from '../utils/sessionActions';
import './Dashboard.css';

// recharts is heavy (~116 kB gzip); load the analytics section on demand so it never bloats the
// main/login bundle, and only for an unscoped admin key: /stats/messages refuses every other key.
const DashboardCharts = lazy(() => import('../components/DashboardCharts').then(m => ({ default: m.DashboardCharts })));

export function Dashboard() {
  const { t } = useTranslation();
  useDocumentTitle(t('dashboard.title'));
  const navigate = useNavigate();
  const { canWrite, isAdmin, scoped } = useRole();
  // The cross-session statistics also refuse a session-scoped key, whatever its role.
  const canReadStats = isAdmin && !scoped;
  const toast = useToast();
  const {
    data: sessions = [],
    isLoading: loadingSessions,
    error: sessionsError,
    isLoadingError: sessionsNeverLoaded,
  } = useSessionsQuery();
  const { data: stats } = useSessionStatsQuery();
  // GET /webhooks is OPERATOR-only and /stats/overview ADMIN-only. A key without the role is not sent
  // them, since the gateway audits every refusal as a failed authentication; their cards show the
  // unavailable placeholder.
  const { data: webhooks } = useWebhooksQuery(canWrite);
  const { data: overview } = useStatsOverviewQuery(canReadStats);
  const stopMutation = useStopSessionMutation();
  const unavailable = '—';
  const messagesToday = overview ? overview.messages.today.sent + overview.messages.today.received : unavailable;
  const totalMessages = overview ? overview.messages.sent + overview.messages.received : unavailable;
  const loading = loadingSessions;
  // Only a read that never succeeded replaces the page: a failed background refetch keeps its cached
  // data (as the webhook card below does), so the last good view stays on screen.
  const error = sessionsNeverLoaded
    ? sessionsError instanceof Error
      ? sessionsError.message
      : t('dashboard.loadError')
    : null;
  // A viewer is not sent the webhook read, and a pending or failed read is not zero webhooks either.
  // A failed background refetch keeps the cached list, which still counts.
  const webhookCount = !canWrite || !webhooks ? unavailable : webhooks.length;

  const handleDisconnect = async (id: string) => {
    try {
      await stopMutation.mutateAsync(id);
    } catch (err) {
      toast.error(t('dashboard.disconnectFailed'), err instanceof Error ? err.message : undefined);
    }
  };

  const statsCards = [
    {
      label: t('dashboard.stats.activeSessions'),
      value: stats?.ready ?? 0,
      icon: MessageSquare,
      theme: 'emerald',
      detail: stats ? t('dashboard.stats.sessionsDetail', { running: stats.active, total: stats.total }) : undefined,
    },
    { label: t('dashboard.stats.messagesToday'), value: messagesToday, icon: Send, theme: 'sky' },
    { label: t('dashboard.stats.webhooksConfigured'), value: webhookCount, icon: Webhook, theme: 'violet' },
    { label: t('dashboard.stats.totalMessages'), value: totalMessages, icon: Activity, theme: 'amber' },
  ];

  const formatLastActive = (date?: string | null) => {
    if (!date) return t('common.never');
    const diff = Date.now() - new Date(date).getTime();
    if (diff < 60000) return t('common.justNow');
    if (diff < 3600000) return t('common.minAgo', { count: Math.floor(diff / 60000) });
    if (diff < 86400000) return t('common.hoursAgo', { count: Math.floor(diff / 3600000) });
    return new Date(date).toLocaleDateString();
  };

  const formatStatus = (status: string) => t(`sessionStatus.${status}`, { defaultValue: status });

  if (loading) {
    return (
      <div
        className="dashboard"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}
      >
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard" style={{ padding: '2rem' }}>
        <div
          style={{ background: 'rgba(239, 68, 68, 0.12)', padding: '1rem', borderRadius: '8px', color: 'var(--error)' }}
        >
          {t('dashboard.errorPrefix', { message: error })}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        badge={
          <span className={`status-badge ${stats && stats.ready > 0 ? 'connected' : 'disconnected'}`}>
            <span className={`status-dot ${stats && stats.ready > 0 ? 'pulse' : 'inactive'}`} />
            {stats && stats.ready > 0 ? t('common.connected') : t('common.disconnected')}
          </span>
        }
      />

      <div className="stats-grid">
        {statsCards.map(({ label, value, icon: Icon, theme, detail }) => (
          <div key={label} className={`stat-card theme-${theme}`}>
            <Icon className="stat-watermark" />
            <div className="stat-header">
              <span className="stat-label">{label}</span>
              <div className="stat-icon-wrapper">
                <Icon size={20} />
              </div>
            </div>
            <div className="stat-value">{typeof value === 'number' ? value.toLocaleString() : value}</div>
            {detail && (
              <div className="stat-detail">
                <Layers size={13} className="stat-detail-icon" />
                <span>{detail}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {canReadStats && (
        <Suspense fallback={null}>
          <DashboardCharts />
        </Suspense>
      )}

      <section className="sessions-section">
        <div className="section-header">
          <div className="section-title-wrap">
            <div className="section-title-icon">
              <Smartphone size={18} />
            </div>
            <div>
              <h2>{t('dashboard.sessionsOverview')}</h2>
            </div>
            <span className="section-count-badge">
              <Layers size={12} />
              {t('dashboard.showingSessions', { shown: sessions.length, total: stats?.total ?? 0 })}
            </span>
          </div>

          <div className="section-actions">
            <button className="btn-link-all" onClick={() => navigate('/sessions')}>
              <span>{t('nav.sessions')}</span>
              <Eye size={14} />
            </button>
          </div>
        </div>

        <div className="sessions-table-wrapper">
          <div className="sessions-table">
            <div className="table-header">
              <span className="th-item">
                <Hash size={13} /> {t('dashboard.columns.sessionId')}
              </span>
              <span className="th-item">
                <Phone size={13} /> {t('dashboard.columns.phone')}
              </span>
              <span className="th-item">
                <Activity size={13} /> {t('dashboard.columns.status')}
              </span>
              <span className="th-item">
                <Clock size={13} /> {t('dashboard.columns.lastActive')}
              </span>
              <span className="th-item">
                <SlidersHorizontal size={13} /> {t('dashboard.columns.actions')}
              </span>
            </div>
            {sessions.length === 0 ? (
              <div className="table-empty-row">
                <Smartphone size={36} className="empty-icon" />
                <span className="empty-title">{t('dashboard.noSessions')}</span>
              </div>
            ) : (
              sessions.map(session => (
                <div key={session.id} className="table-row">
                  <div className="session-info-cell">
                    <div className="session-avatar">
                      <Smartphone size={18} />
                    </div>
                    <div className="session-text-group">
                      <span className="session-name" title={session.name}>
                        {session.name}
                      </span>
                      <span className="session-id-chip">{session.id.substring(0, 12)}</span>
                    </div>
                  </div>
                  <span className="phone-cell">
                    <Phone size={13} className="phone-icon" />
                    {session.phone || '—'}
                  </span>
                  <span className={`status-pill ${session.status}`}>
                    {session.status === 'ready' ? (
                      <>
                        <span className="status-dot pulse" />
                        <CheckCircle2 size={13} />
                      </>
                    ) : session.status === 'initializing' || session.status === 'authenticating' ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : session.status === 'qr_ready' ? (
                      <QrCode size={13} />
                    ) : session.status === 'failed' ? (
                      <AlertCircle size={13} />
                    ) : (
                      <XCircle size={13} />
                    )}
                    <span>{formatStatus(session.status)}</span>
                  </span>
                  <span className="last-active">
                    <Clock size={13} className="last-active-icon" />
                    {formatLastActive(session.lastActive)}
                  </span>
                  <div className="actions">
                    <button className="btn-action btn-view" onClick={() => navigate('/sessions')}>
                      <Eye size={13} />
                      <span>{t('dashboard.view')}</span>
                    </button>
                    {/* Stopping a session is an operator write; a read-only key would only collect a 403. */}
                    {canWrite && isSessionStarted(session) && (
                      <button className="btn-action btn-danger" onClick={() => handleDisconnect(session.id)}>
                        <Power size={13} />
                        <span>{t('dashboard.disconnect')}</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
