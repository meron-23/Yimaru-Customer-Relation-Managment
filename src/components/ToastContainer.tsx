import { useData } from '../context/DataContext';

export function ToastContainer() {
  const { toasts, removeToast } = useData();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-wrap" role="region" aria-label="Notifications">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type || 'info'}`} onClick={() => removeToast(t.id)}>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
