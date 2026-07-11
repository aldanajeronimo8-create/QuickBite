import { useState } from 'react';
import { useDataStore, HistoryEntry } from '../../../store/dataStore';
import {
  History,
  Trash2,
  Package,
  ShoppingBag,
  Tag,
  Plus,
  Pencil,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  User,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

const ACTION_LABELS: Record<HistoryEntry['action'], { label: string; color: string }> = {
  create: { label: 'Creado', color: 'bg-green-100 text-green-800' },
  update: { label: 'Actualizado', color: 'bg-blue-100 text-blue-800' },
  delete: { label: 'Eliminado', color: 'bg-red-100 text-red-800' },
  status_change: { label: 'Estado', color: 'bg-yellow-100 text-yellow-800' },
};

const ENTITY_ICONS: Record<HistoryEntry['entity'], React.ElementType> = {
  product: Package,
  order: ShoppingBag,
  category: Tag,
  user: User,
};

const ACTION_ICONS: Record<HistoryEntry['action'], React.ElementType> = {
  create: Plus,
  update: Pencil,
  delete: X,
  status_change: RefreshCw,
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-500 min-w-24">{label}:</span>
      <span className="text-gray-800 font-medium">{String(value)}</span>
    </div>
  );
}

function HistoryCard({ entry }: { entry: HistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const EntityIcon = ENTITY_ICONS[entry.entity];
  const ActionIcon = ACTION_ICONS[entry.action];
  const { label, color } = ACTION_LABELS[entry.action];

  const hasDiff = entry.before || entry.after;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        <div className="flex-shrink-0 w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
          <EntityIcon className="w-5 h-5 text-blue-600" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}
            >
              <ActionIcon className="w-3 h-3" />
              {label}
            </span>
            <span className="text-xs text-gray-400 capitalize">{entry.entity}</span>
          </div>
          <p className="text-sm text-gray-800">{entry.description}</p>
          <p className="text-xs text-gray-400 mt-1">{formatDate(entry.timestamp)}</p>
        </div>

        {hasDiff && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {expanded && hasDiff && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {entry.before && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                Antes
              </p>
              <div className="space-y-1">
                {Object.entries(entry.before).map(([k, v]) => (
                  <DetailRow key={k} label={k} value={v} />
                ))}
              </div>
            </div>
          )}
          {entry.after && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                Después
              </p>
              <div className="space-y-1">
                {Object.entries(entry.after).map(([k, v]) => (
                  <DetailRow key={k} label={k} value={v} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminHistory() {
  const { history, clearHistory } = useDataStore();
  const [filter, setFilter] = useState<'all' | HistoryEntry['action'] | HistoryEntry['entity']>(
    'all',
  );

  const filtered =
    filter === 'all' ? history : history.filter((e) => e.action === filter || e.entity === filter);

  const handleClear = () => {
    clearHistory();
    toast.success('Historial limpiado');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <History className="w-8 h-8 text-blue-600" />
            Historial de Cambios
          </h1>
          <p className="text-gray-500 mt-1">{history.length} modificaciones registradas</p>
        </div>
        {history.length > 0 && (
          <Button
            variant="outline"
            onClick={handleClear}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Limpiar historial
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(
          [
            { value: 'all', label: 'Todos' },
            { value: 'create', label: 'Creaciones' },
            { value: 'update', label: 'Actualizaciones' },
            { value: 'delete', label: 'Eliminaciones' },
            { value: 'status_change', label: 'Cambios de estado' },
            { value: 'product', label: 'Productos' },
            { value: 'order', label: 'Pedidos' },
          ] as { value: typeof filter; label: string }[]
        ).map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <History className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg">No hay registros en el historial</p>
          <p className="text-sm mt-1">Las modificaciones que hagas aparecerán aquí</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => (
            <HistoryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
