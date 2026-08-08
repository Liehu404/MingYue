import { useState, useCallback } from 'react';
import { DndContext, DragOverlay, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
import type { TeamMember, RoleDefinition } from '../../api/teams';
import { buildTree } from './MemberTreeNode';
import EditableMemberTreeNode from './EditableMemberTreeNode';

interface Props {
  members: TeamMember[];
  roleDefinitions: Record<string, RoleDefinition>;
  canEdit: boolean;
  onReparent: (memberId: number, newParentId: number | null) => Promise<void>;
  onRoleChange: (userId: number, newRole: string) => Promise<void>;
  onRemove: (userId: number) => Promise<void>;
}

export default function EditableMemberTree({ members, roleDefinitions, canEdit, onReparent, onRoleChange, onRemove }: Props) {
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [activeMember, setActiveMember] = useState<TeamMember | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const tree = buildTree(members);

  const findMemberById = (dbId: number): TeamMember | undefined =>
    members.find((m) => m.id === dbId);

  const isDescendant = useCallback((ancestorId: number, descendantId: number): boolean => {
    const walk = (parentId: number): boolean => {
      const children = members.filter((m) => m.parent_member_id === parentId);
      for (const child of children) {
        if (child.id === descendantId) return true;
        if (walk(child.id)) return true;
      }
      return false;
    };
    return walk(ancestorId);
  }, [members]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const memberId = active.data.current?.memberDbId as number | undefined;
    if (memberId) {
      const m = findMemberById(memberId);
      setDraggedId(active.data.current?.memberId ?? null);
      setActiveMember(m || null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedId(null);
    setActiveMember(null);

    if (!over) return;

    const draggedMemberDbId = active.data.current?.memberDbId as number | undefined;
    const overMemberDbId = over.data.current?.memberDbId as number | undefined;
    const isRootDrop = over.id === 'drop-root';

    if (!draggedMemberDbId) return;

    const draggedMember = findMemberById(draggedMemberDbId);
    if (!draggedMember) return;

    if (isRootDrop) {
      if (draggedMember.parent_member_id === null) return;
      await onReparent(draggedMember.user_id, null);
      return;
    }

    if (!overMemberDbId) return;
    if (draggedMemberDbId === overMemberDbId) return;
    if (draggedMember.parent_member_id === overMemberDbId) return;

    // Frontend cycle check
    if (isDescendant(draggedMemberDbId, overMemberDbId)) {
      alert('不能将成员移动到其下级成员之下');
      return;
    }

    const overMember = findMemberById(overMemberDbId);
    if (!overMember) return;

    await onReparent(draggedMember.user_id, overMember.user_id);
  };

  const displayName = activeMember
    ? (activeMember.user?.display_name || activeMember.user?.username || `用户#${activeMember.user_id}`)
    : '';
  const initial = displayName.charAt(0);
  const activeRoleInfo = activeMember
    ? (roleDefinitions[activeMember.team_role] || { label: activeMember.team_role, color: '#8e8e93' })
    : { label: '', color: '#999' };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* Root drop zone — visible only during drag */}
      {canEdit && draggedId !== null && (
        <DropZone />
      )}

      {tree.length === 0 ? (
        <p className="typography-caption" style={{ color: 'var(--color-ink-muted-48)', textAlign: 'center', padding: '20px 0' }}>
          暂无成员
        </p>
      ) : (
        tree.map((node, i) => (
          <EditableMemberTreeNode
            key={node.id}
            node={node}
            depth={0}
            isLast={i === tree.length - 1}
            roleDefinitions={roleDefinitions}
            canEdit={canEdit}
            draggedId={draggedId}
            onReparent={onReparent}
            onRoleChange={onRoleChange}
            onRemove={onRemove}
          />
        ))
      )}

      <DragOverlay dropAnimation={null}>
        {activeMember ? (
          <div className="org-tree-drag-overlay">
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: activeRoleInfo.color,
              color: '#fff', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 13, fontWeight: 700,
              flexShrink: 0,
            }}>
              {initial}
            </div>
            <span style={{ color: 'var(--color-ink)' }}>{displayName}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px',
              borderRadius: 9999, background: `${activeRoleInfo.color}18`,
              color: activeRoleInfo.color,
            }}>
              {activeRoleInfo.label}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function DropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'drop-root' });

  return (
    <div
      ref={setNodeRef}
      className={`org-tree-root-drop-zone ${isOver ? 'org-tree-root-drop-zone-active' : ''}`}
    >
      {isOver ? '松开放到这里设为根节点' : '拖到此处设为根节点（无上级）'}
    </div>
  );
}
