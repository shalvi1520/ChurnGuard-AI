import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, AlertTriangle, Mail, Database, Brain, Check, X } from 'lucide-react';
import { cn, formatRelativeDate } from '../../utils/helpers';
import { useApp } from '../../context/AppContext';
import { notificationService } from '../../services/api';

const typeIcons = {
  risk: AlertTriangle,
  outreach: Mail,
  data: Database,
  prediction: Brain,
  recommendation: Brain,
};

const priorityColors = {
  critical: 'text-risk-critical',
  high: 'text-risk-high',
  medium: 'text-risk-medium',
  low: 'text-text-tertiary',
};

export default function NotificationPanel({ isOpen, onClose }) {
  const { notifications, dispatch } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const data = await notificationService.getNotifications();
        dispatch({ type: 'SET_NOTIFICATIONS', payload: data });
      } catch (e) {
        // silent
      }
    }
    load();
  }, [dispatch]);

  const handleClick = (notif) => {
    dispatch({ type: 'MARK_NOTIFICATION_READ', payload: notif.id });
    if (notif.link) navigate(notif.link);
    onClose();
  };

  const handleMarkAllRead = () => {
    dispatch({ type: 'MARK_ALL_READ' });
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.96 }}
        className="absolute top-full right-0 mt-2 w-96 max-h-[70vh] rounded-xl border border-border bg-bg-secondary shadow-2xl z-40 overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Notifications</h3>
          <button
            onClick={handleMarkAllRead}
            className="text-xs text-text-tertiary hover:text-accent transition-colors cursor-pointer"
          >
            Mark all read
          </button>
        </div>
        <div className="overflow-y-auto max-h-[60vh] divide-y divide-border">
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-sm text-text-tertiary">
              No notifications
            </div>
          ) : (
            notifications.map((notif) => {
              const Icon = typeIcons[notif.type] || Bell;
              return (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 w-full text-left hover:bg-bg-tertiary/50 transition-colors cursor-pointer',
                    !notif.read && 'bg-accent/3'
                  )}
                >
                  <div className={cn('p-1.5 rounded-lg bg-bg-tertiary shrink-0 mt-0.5', priorityColors[notif.priority])}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn('text-sm font-medium truncate', notif.read ? 'text-text-secondary' : 'text-text-primary')}>
                        {notif.title}
                      </p>
                      {!notif.read && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
                    </div>
                    <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">{notif.message}</p>
                    <p className="text-[10px] text-text-tertiary mt-1">{formatRelativeDate(notif.timestamp)}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </motion.div>
    </>
  );
}
