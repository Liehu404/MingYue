import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TeamMember, RoleDefinition } from '../../api/teams';

export interface TreeNode extends TeamMember {
  children: TreeNode[];
}

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  captain: { label: '队长', color: '#faad14' },
  pm: { label: '项管', color: '#722ed1' },
  tech_lead: { label: '技术组长', color: '#2f54eb' },
  student: { label: '成员', color: '#52c41a' },
};

const ROLE_ORDER: Record<string, number> = {
  captain: 0,
  pm: 1,
  tech_lead: 2,
  student: 3,
};

function sortByRole(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    const orderA = ROLE_ORDER[a.team_role] ?? 99;
    const orderB = ROLE_ORDER[b.team_role] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    // Same role: sort by name
    const nameA = a.user?.display_name || a.user?.username || '';
    const nameB = b.user?.display_name || b.user?.username || '';
    return nameA.localeCompare(nameB, 'zh');
  });
}

function getRoleInfo(role: string) {
  return ROLE_CONFIG[role] || { label: role, color: '#8e8e93' };
}

interface Props {
  node: TreeNode;
  depth: number;
  isLast: boolean;
  roleDefinitions?: Record<string, RoleDefinition>;
}

export default function MemberTreeNode({ node, depth, isLast, roleDefinitions }: Props) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const roleInfo = (roleDefinitions && roleDefinitions[node.team_role])
    ? roleDefinitions[node.team_role]
    : getRoleInfo(node.team_role);
  const displayName = node.user?.display_name || node.user?.username || `用户#${node.user_id}`;
  const initial = displayName.charAt(0);
  const sortedChildren = hasChildren ? sortByRole([...node.children]) : [];

  return (
    <div className="org-tree-branch">
      {/* Node card */}
      <div className="org-tree-node-row" style={{ paddingLeft: depth * 40 }}>
        {/* Connector lines */}
        {depth > 0 && (
          <div className="org-tree-lines">
            <div className="org-tree-line-v" style={{ height: '50%', top: 0 }} />
            <div className="org-tree-line-h" style={{ width: 20, left: -20 }} />
            {!isLast && <div className="org-tree-line-v" style={{ height: '50%', bottom: 0, top: '50%' }} />}
          </div>
        )}

        <motion.div
          className="org-tree-card"
          whileHover={{ scale: 1.02, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
          onClick={() => hasChildren && setExpanded(!expanded)}
          style={{ cursor: hasChildren ? 'pointer' : 'default' }}
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

          {/* Avatar */}
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

          {/* Role badge */}
          <span className="org-tree-role-badge" style={{
            background: `${roleInfo.color}18`,
            color: roleInfo.color,
          }}>
            {roleInfo.label}
          </span>
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
              <MemberTreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                isLast={i === sortedChildren.length - 1}
                roleDefinitions={roleDefinitions}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Build tree from flat member array, sorted by role priority */
export function buildTree(members: TeamMember[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  members.forEach((m) => map.set(m.id, { ...m, children: [] }));
  const roots: TreeNode[] = [];
  map.forEach((node) => {
    if (node.parent_member_id && map.has(node.parent_member_id)) {
      map.get(node.parent_member_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  // Sort children at every level
  map.forEach((node) => {
    sortByRole(node.children);
  });
  return sortByRole(roots);
}
