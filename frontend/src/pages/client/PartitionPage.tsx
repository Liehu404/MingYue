import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { partitionApi, type Partition } from '../../api/partitions';

function ChevronRight({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function PartitionNode({
  partition,
  depth,
  defaultExpanded,
}: {
  partition: Partition;
  depth: number;
  defaultExpanded: boolean;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = partition.children && partition.children.length > 0;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 14px',
          paddingLeft: `${14 + depth * 28}px`,
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          transition: 'background var(--transition-fast)',
          gap: '8px',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-pearl)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
        }}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setExpanded(!expanded);
          }}
          style={{
            width: '22px',
            height: '22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            cursor: hasChildren ? 'pointer' : 'default',
            padding: 0,
            color: 'var(--color-ink-muted-48)',
            transition: 'transform var(--transition-fast)',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            visibility: hasChildren ? 'visible' : 'hidden',
            flexShrink: 0,
          }}
        >
          <ChevronRight />
        </button>

        {/* Partition name + description */}
        <div
          style={{ flex: 1, minWidth: 0 }}
          onClick={() => navigate(`/resources?partition_id=${partition.id}`)}
        >
          <span
            className="typography-body"
            style={{
              color: hasChildren ? 'var(--color-ink)' : 'var(--color-ink-muted-80)',
              fontWeight: hasChildren ? 600 : 400,
              display: 'block',
            }}
          >
            {partition.name}
          </span>
          {partition.description && (
            <span
              className="typography-caption"
              style={{
                color: 'var(--color-ink-muted-48)',
                display: 'block',
                marginTop: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {partition.description}
            </span>
          )}
        </div>

        {/* Resource count indicator */}
        <span
          className="typography-caption"
          style={{ color: 'var(--color-ink-muted-48)', flexShrink: 0, fontSize: '12px' }}
        >
          {hasChildren ? `${partition.children!.length} 子分区` : '分区'}
        </span>
      </div>

      {/* Children */}
      <AnimatePresence>
        {expanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            {partition.children!.map((child) => (
              <PartitionNode
                key={child.id}
                partition={child}
                depth={depth + 1}
                defaultExpanded={false}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PartitionPage() {
  const [partitions, setPartitions] = useState<Partition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await partitionApi.tree();
      setPartitions(res.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || '加载分区数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      style={{ background: 'var(--color-parchment)', minHeight: '100vh', width: '100%' }}
    >
      {/* Banner */}
      <section className="product-tile-light" style={{ paddingTop: '60px', paddingBottom: '48px' }}>
        <div className="tile-content">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] }}
            style={{ textAlign: 'center' }}
          >
            <h1 className="typography-display-lg" style={{ marginBottom: '12px' }}>
              分区浏览
            </h1>
            <p className="typography-lead" style={{ color: 'var(--color-ink-muted-48)', maxWidth: '600px', margin: '0 auto' }}>
              按学术领域浏览资源分区，层层深入，精准定位你所需的知识领域。
            </p>
          </motion.div>
        </div>
      </section>

      {/* Tree */}
      <section style={{ maxWidth: '740px', margin: '0 auto', padding: '0 var(--spacing-lg) 80px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p className="typography-body" style={{ color: 'var(--color-ink-muted-48)' }}>加载中...</p>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p className="typography-body" style={{ color: '#cc0000', marginBottom: '16px' }}>{error}</p>
            <button onClick={load} className="button-primary">重试</button>
          </div>
        ) : partitions.length === 0 ? (
          <div
            style={{
              background: 'var(--color-canvas)',
              borderRadius: 'var(--radius-lg)',
              padding: '64px 48px',
              textAlign: 'center',
              border: '1px solid var(--color-hairline)',
            }}
          >
            <h2 className="typography-display-md" style={{ marginBottom: '12px', color: 'var(--color-ink-muted-48)' }}>
              暂无分区
            </h2>
            <p className="typography-body" style={{ color: 'var(--color-ink-muted-48)' }}>
              管理员尚未创建学术分区。请稍后再来浏览。
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            style={{
              background: 'var(--color-canvas)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--color-hairline)',
              boxShadow: 'var(--shadow-soft)',
              padding: '12px 0',
            }}
          >
            {partitions.map((p) => (
              <PartitionNode key={p.id} partition={p} depth={0} defaultExpanded />
            ))}
          </motion.div>
        )}
      </section>
    </motion.div>
  );
}
