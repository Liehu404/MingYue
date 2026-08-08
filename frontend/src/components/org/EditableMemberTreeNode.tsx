import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { RoleDefinition } from '../../api/teams';
import type { TreeNode } from './MemberTreeNode';
import { buildTree } from './MemberTreeNode';

export { buildTree };
export type { TreeNode };

function sortByRole(nodes: TreeNode[]): TreeNode[] {
  const ROLE_ORDER: Record<string, number> = {
    captain: 0, pm: 1, tech_lead: 2, student: 3,
  };
  return nodes.sort((a, b) => {
    const orderA = ROLE_ORDER[a.team_role] ?? 99;
    const orderB = ROLE_ORDER[b.team_role] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    const nameA = a.user?.display_name || a.user?.username || '';
    const nameB = b.user?.display_name || b.user?.username || '';
    return nameA.localeCompare(nameB, 'zh');
  });
}

const ROLE_DEFAULTS: Record<string, { label: string; color: string }> = {
  captain: { label: '队长', color: '#faad14' },
  pm: { label: '项管', color: '#722ed1' },
  tech_lead: { label: '技术组长', color: '#2f54eb' },
  student: { label: '成员', color: '#52c41a' },
};

interface Props {
  node: TreeNode;
  depth: number;
  isLast: boolean;
  roleDefinitions: Record<string, RoleDefinition>;
  canEdit: boolean;
  draggedId: number | null;
  onReparent: (memberId: number, newParentId: number | null) => void;
  onRoleChange: (userId: number, newRole: string) => void;
  onRemove: (userId: number) => void;
}

export default function EditableMemberTreeNode({
  node, depth, isLast, roleDefinitions, canEdit, draggedId, onReparent, onRoleChange, onRemove,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [editingRole, setEditingRole] = useState(false);
  const hasChildren = node.children.length > 0;
  const sortedChildren = hasChildren ? sortByRole([...node.children]) : [];

  const displayName = node.user?.display_name || node.user?.username || `用户#${node.user_id}`;
  const initial = displayName.charAt(0);

  const roleInfo = roleDefinitions[node.team_role]
    || ROLE_DEFAULTS[node.team_role]
    || { label: node.team_role, color: '#8e8e93' };

  const isThisDragging = draggedId === node.user_id;

  const { setNodeRef: setDraggableRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: `drag-${node.id}`,
    data: { memberId: node.user_id, memberDbId: node.id },
    disabled: !canEdit,
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `drop-${node.id}`,
    data: { memberId: node.user_id, memberDbId: node.id },
    disabled: !canEdit || isThisDragging,
  });

  const combinedRef = useCallback(
    (el: HTMLElement | null) => {
      setDraggableRef(el);
      setDroppableRef(el);
    },
    [setDraggableRef, setDroppableRef],
  );

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`确定要移除成员 "${displayName}" 吗？`)) {
      onRemove(node.user_id);
    }
  };

  const cardClass = [
    'org-tree-card',
    isDragging ? 'org-tree-card-dragging' : '',
    isOver ? 'org-tree-card-drop-target' : '',
    canEdit && !isThisDragging ? 'org-tree-card-can-drag' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="org-tree-branch">
      <div className="org-tree-node-row" style={{ paddingLeft: depth * 40 }}>
        {depth > 0 && (
          <div className="org-tree-lines">
            <div className="org-tree-line-v" style={{ height: '50%', top: 0 }} />
            <div className="org-tree-line-h" style={{ width: 20, left: -20 }} />
            {!isLast && <div className="org-tree-line-v" style={{ height: '50%', bottom: 0, top: '50%' }} />}
          </div>
        )}

        <motion.div
          ref={combinedRef}
          className={cardClass}
          {...(canEdit ? { ...attributes, ...listeners } : {})}
          whileHover={canEdit ? { scale: 1.02 } : undefined}
          onClick={() => hasChildren && setExpanded(!expanded)}
          style={{
            cursor: hasChildren ? 'pointer' : canEdit ? 'grab' : 'default',
            transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
          }}
        >
          {/* Expand toggle */}
          {hasChildren && (
            <motion.span
              className="org-tree-chevron"
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={{ duration: 0.2 }}
            >
              ▶
            </motion.span>
          )}
          {!hasChildren && <span className="org-tree-chevron" style={{ visibility: 'hidden' }}>▶</span>}

          {/* Avatar — drag handle area */}
          <div className="org-tree-avatar" style={{ background: roleInfo.color }}>
            {initial}
          </div>

          {/* Info */}
          <div className="org-tree-info">
            <span className="org-tree-name">{displayName}</span>
            {node.position_title && (
              <span className="org-tree-position">{node.position_title}</span>
            )}
          </div>

          {/* Role badge — click to change role */}
          {canEdit ? (
            <div style={{ position: 'relative' }}>
              <button
                className="org-tree-edit-role-btn"
                style={{ background: `${roleInfo.color}18`, color: roleInfo.color }}
                onClick={(e) => { e.stopPropagation(); setEditingRole(!editingRole); }}
              >
                {roleInfo.label}
              </button>
              <AnimatePresence>
                {editingRole && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    style={{
                      position: 'absolute', top: '100%', right: 0, zIndex: 10, marginTop: 4,
                      background: 'var(--color-canvas)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: 'var(--shadow-product)',
                      overflow: 'hidden', minWidth: 140,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {['captain', 'pm', 'tech_lead', 'student'].map((roleKey) => {
                      const rd = roleDefinitions[roleKey] || ROLE_DEFAULTS[roleKey] || { label: roleKey, color: '#8e8e93' };
                      return (
                        <div
                          key={roleKey}
                          onClick={() => {
                            onRoleChange(node.user_id, roleKey);
                            setEditingRole(false);
                          }}
                          style={{
                            padding: '8px 14px', cursor: 'pointer', fontSize: '13px',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: node.team_role === roleKey ? 'rgba(0,102,204,0.06)' : 'transparent',
                            transition: 'background 0.1s',
                          }}
                        >
                          <span style={{
                            display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                            background: rd.color, flexShrink: 0,
                          }} />
                          {rd.label}
                          {node.team_role === roleKey && (
                            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--color-primary)' }}>✓</span>
                          )}
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <span className="org-tree-role-badge" style={{
              background: `${roleInfo.color}18`, color: roleInfo.color,
            }}>
              {roleInfo.label}
            </span>
          )}

          {/* Remove button */}
          {canEdit && (
            <button
              onClick={handleRemove}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-ink-muted-48)', fontSize: '14px',
                padding: '2px 6px', flexShrink: 0, marginLeft: 4,
              }}
              title="移除成员"
            >
              ✕
            </button>
          )}
        </motion.div>
      </div>

      {/* Children */}
      <AnimatePresence>
        {expanded && hasChildren && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          >
            {sortedChildren.map((child, i) => (
              <EditableMemberTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                isLast={i === sortedChildren.length - 1}
                roleDefinitions={roleDefinitions}
                canEdit={canEdit}
                draggedId={draggedId}
                onReparent={onReparent}
                onRoleChange={onRoleChange}
                onRemove={onRemove}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
