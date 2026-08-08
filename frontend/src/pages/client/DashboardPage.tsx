import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { usePageBackground } from '../../hooks/usePageBackground';
import heroOrbit from '../../assets/illustrations/hero-orbit.svg';
import resourceGallery from '../../assets/illustrations/resource-gallery.svg';
import teamConstellation from '../../assets/illustrations/team-constellation.svg';

const FADE_UP = {
  hidden: { opacity: 0, y: 40 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const } },
};

const STAGGER = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.12 } },
};

function AnimatedCounter({ value, label }: { value: string; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="glass-surface"
      style={{
        textAlign: 'center',
        padding: '28px 40px',
        borderRadius: 18,
        minWidth: 140,
      }}
    >
      <div className="text-gradient-blue" style={{
        fontSize: 48, fontWeight: 700, lineHeight: 1.1,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 14, color: '#7a7a7a', marginTop: 4, fontWeight: 500 }}>
        {label}
      </div>
    </motion.div>
  );
}

function ParallaxTile({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [40, -40]);
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0.6, 1, 1, 0.6]);

  return (
    <motion.div ref={ref} style={{ ...style, y, opacity }}>
      {children}
    </motion.div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const heroBg = usePageBackground('dashboard-hero');
  const statsBg = usePageBackground('dashboard-stats');
  const resourceBg = usePageBackground('dashboard-resource');
  const teamBg = usePageBackground('dashboard-team');
  return (
    <div style={{ background: '#fff', overflow: 'hidden' }}>
      {/* ── Hero ── */}
      <section style={{
        position: 'relative',
        background: heroBg ? `url(${heroBg}) center/cover no-repeat` : '#ffffff',
        padding: '120px 0 90px',
        textAlign: 'center',
        overflow: 'hidden',
        isolation: 'isolate',
      }}>
        {/* Atmospheric background layers */}
        <div className="bg-dots" />
        <div className="bg-mesh-light" />
        <div className="shimmer-line" />

        {/* Large ambient orbs */}
        <div style={{
          position: 'absolute', top: '-30%', left: '-10%',
          width: 500, height: 500,
          background: 'radial-gradient(circle, rgba(0,102,204,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
          animation: 'floatOrb1 16s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', bottom: '-25%', right: '-8%',
          width: 420, height: 420,
          background: 'radial-gradient(circle, rgba(8,145,178,0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
          animation: 'floatOrb2 18s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', top: '40%', right: '15%',
          width: 180, height: 180,
          background: 'radial-gradient(circle, rgba(124,58,237,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
          animation: 'floatOrb3 14s ease-in-out infinite',
        }} />

        <motion.div
          className="tile-content"
          variants={STAGGER}
          initial="hidden"
          animate="show"
          style={{ position: 'relative', zIndex: 1 }}
        >
          <motion.p
            variants={FADE_UP}
            className="text-glow-subtle"
            style={{
              fontSize: 21, fontWeight: 600,
              background: 'linear-gradient(135deg, #0052a3, #0066cc, #0891b2)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              letterSpacing: '0.231px', marginBottom: 16,
            }}
          >
            明月学术 2.0
          </motion.p>

          <motion.h1
            variants={FADE_UP}
            className="typography-hero-display text-shadow-elevated"
            style={{ marginBottom: 20 }}
          >
            打破学术藩篱。<br />连接无限可能。
          </motion.h1>

          <motion.p
            variants={FADE_UP}
            style={{
              fontSize: 24, fontWeight: 300, lineHeight: 1.5,
              color: '#7a7a7a', maxWidth: 600, margin: '0 auto 44px',
            }}
          >
            在一个纯粹的数字空间里，发现顶尖院校的课程资源，与志同道合的学者组建团队。
          </motion.p>

          <motion.div variants={FADE_UP} className="tile-actions" style={{ marginBottom: 0, justifyContent: 'center' }}>
            <Link
              to="/resources"
              className="button-primary"
              style={{ fontSize: 17, padding: '14px 28px', boxShadow: '0 4px 20px rgba(0,102,204,0.25)' }}
            >
              探索资源
            </Link>
            <Link to="/teams" className="button-secondary-pill" style={{ fontSize: 17, padding: '14px 28px' }}>
              寻找团队
            </Link>
          </motion.div>

          <motion.div variants={FADE_UP} className="hero-visual-wrap">
            <div className="hero-ambient-orb orb-left" />
            <div className="hero-ambient-orb orb-right" />
            <motion.img
              src={heroOrbit}
              alt="抽象轨道视觉"
              className="hero-visual-img"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        </motion.div>
      </section>

      {/* ── Stats Bar ── */}
      <section style={{
        background: statsBg ? `url(${statsBg}) center/cover no-repeat` : 'linear-gradient(135deg, #f5f5f7 0%, #fafafc 50%, #f0f0f5 100%)',
        padding: '48px 0',
        borderTop: '1px solid #e0e0e0',
        borderBottom: '1px solid #e0e0e0',
        position: 'relative',
      }}>
        <div className="bg-dots" />
        <div className="tile-content" style={{
          flexDirection: 'row', justifyContent: 'space-around',
          flexWrap: 'wrap', gap: 40, position: 'relative', zIndex: 1,
        }}>
          <AnimatedCounter value="500+" label="学术资源" />
          <AnimatedCounter value="30+" label="活跃战队" />
          <AnimatedCounter value="200+" label="注册用户" />
          <AnimatedCounter value="50+" label="合作院校" />
        </div>
      </section>

      {/* ── Feature: Resources ── */}
      <ParallaxTile>
        <section className="product-tile-dark" style={{
          marginTop: 0,
          background: resourceBg ? `url(${resourceBg}) center/cover no-repeat` : 'linear-gradient(160deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)',
          padding: '100px 0',
          position: 'relative',
          overflow: 'hidden',
          isolation: 'isolate',
        }}>
          {/* Dynamic background mesh */}
          <div className="bg-mesh-dark" />
          <div className="bg-grid-subtle" style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          }} />

          <motion.div
            className="tile-content"
            variants={STAGGER}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-100px' }}
            style={{ position: 'relative', zIndex: 1 }}
          >
            <motion.h2
              variants={FADE_UP}
              className="typography-display-lg text-glow"
              style={{ marginBottom: 16 }}
            >
              海量学术资源
            </motion.h2>
            <motion.p variants={FADE_UP} style={{
              fontSize: 21, fontWeight: 400, lineHeight: 1.5,
              color: '#cccccc', maxWidth: 680,
            }}>
              从课件到历年真题，从参考文献到学术讲座。支持视频、图文、文档表格、外链等多种格式。
            </motion.p>

            <motion.div variants={FADE_UP} className="feature-visual-frame feature-visual-dark">
              <motion.img
                src={resourceGallery}
                alt="资源展示图"
                className="feature-visual-img"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>

            <motion.div variants={FADE_UP} style={{
              marginTop: 56, display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 24, width: '100%', maxWidth: 800,
            }}>
              {[
                { icon: '▶', label: '视频课程', desc: '高清学术讲座与教学视频' },
                { icon: '▣', label: '图文资料', desc: '课件、笔记与思维导图' },
                { icon: '☰', label: '文档表格', desc: '论文、数据与实验报告' },
                { icon: '↗', label: '外部链接', desc: '优质学术站点与资源索引' },
              ].map((item) => (
                <motion.div key={item.label}
                  whileHover={{ scale: 1.03, y: -4 }}
                  transition={{ duration: 0.3 }}
                  className="glass-card-dark"
                  style={{
                    textAlign: 'center',
                    padding: '28px 20px',
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 12 }}>{item.icon}</div>
                  <div style={{ fontSize: 17, fontWeight: 600, color: '#fff', marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 14, color: '#999' }}>{item.desc}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </section>
      </ParallaxTile>

      {/* ── Feature: Teams ── */}
      <section className="product-tile-light" style={{
        background: teamBg ? `url(${teamBg}) center/cover no-repeat` : undefined,
        padding: '100px 0',
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
      }}>
        <div className="bg-dots" />
        <div className="bg-mesh-light" />
        <div style={{
          position: 'absolute', bottom: '-20%', right: '-10%',
          width: 500, height: 500,
          background: 'radial-gradient(circle, rgba(0,102,204,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
          animation: 'floatOrb1 16s ease-in-out infinite',
        }} />

        <motion.div
          className="tile-content"
          variants={STAGGER}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-100px' }}
          style={{ position: 'relative', zIndex: 1 }}
        >
          <motion.h2
            variants={FADE_UP}
            className="typography-display-lg text-shadow-soft"
            style={{ marginBottom: 16 }}
          >
            协作无间
          </motion.h2>
          <motion.p variants={FADE_UP} style={{
            fontSize: 21, fontWeight: 400, lineHeight: 1.5,
            color: '#7a7a7a', maxWidth: 680,
          }}>
            以战队为核心单位，构建学术共同体。清晰的角色分工，高效的资源协作。
          </motion.p>

          <motion.div variants={FADE_UP} className="feature-visual-frame feature-visual-light">
            <motion.img
              src={teamConstellation}
              alt="团队协作图"
              className="feature-visual-img"
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>

          <motion.div variants={FADE_UP} style={{
            marginTop: 56, display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 24, width: '100%', maxWidth: 860,
          }}>
            {[
              { title: '矩阵化管理', desc: '分区 + 战队双维度组织架构，树状知识分类与扁平化团队协作并行', color: '#0066cc' },
              { title: '精细权限', desc: '队长、项管、技术组长、队员四级角色，精确到人的资源管理权限', color: '#0891b2' },
              { title: '公告系统', desc: '战队内实时公告栏，置顶重要通知，确保信息高效传达', color: '#7c3aed' },
              { title: '审核流程', desc: '常规审核 + 管理端终审双保险，保证平台内容质量', color: '#d97706' },
              { title: '资源保护', desc: '公开/战队内可见双层保护，学术成果安全可控', color: '#059669' },
              { title: '交流互动', desc: '点赞、评论、催促审核、举报等完善的互动机制', color: '#dc2626' },
            ].map((item, i) => (
              <motion.div key={item.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                whileHover={{ y: -4, boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}
                className="glass-card"
                style={{
                  padding: '28px 24px',
                  cursor: 'default',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: `linear-gradient(135deg, ${item.color}, ${item.color}dd)`,
                  marginBottom: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 18, fontWeight: 700,
                  boxShadow: `0 4px 12px ${item.color}40`,
                }}>
                  {i + 1}
                </div>
                <div style={{ fontSize: 17, fontWeight: 600, color: '#1d1d1f', marginBottom: 8 }}>{item.title}</div>
                <div style={{ fontSize: 14, color: '#7a7a7a', lineHeight: 1.6 }}>{item.desc}</div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* ── CTA ── */}
      <section style={{
        background: '#f5f5f7',
        padding: '80px 0',
        textAlign: 'center',
        borderTop: '1px solid #e0e0e0',
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
      }}>
        <div className="bg-radial-glow" style={{
          width: 600, height: 600,
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          ['--glow-color' as string]: 'rgba(0, 102, 204, 0.06)',
        } as React.CSSProperties} />
        <motion.div
          className="tile-content"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          style={{ position: 'relative', zIndex: 1 }}
        >
          <h2 className="typography-display-lg text-shadow-soft" style={{ marginBottom: 12 }}>
            {user ? '继续你的学术之旅' : '加入明月学术平台'}
          </h2>
          <p style={{ fontSize: 21, color: '#7a7a7a', marginBottom: 32, maxWidth: 500 }}>
            {user ? '上传资源，协作交流，探索无限可能。' : '注册账号，开始你的学术协作之旅。'}
          </p>
          {user ? (
            <Link
              to="/upload"
              className="button-primary"
              style={{ fontSize: 17, padding: '14px 32px', boxShadow: '0 4px 20px rgba(0,102,204,0.25)' }}
            >
              上传资源
            </Link>
          ) : (
            <Link
              to="/register"
              className="button-primary"
              style={{ fontSize: 17, padding: '14px 32px', boxShadow: '0 4px 20px rgba(0,102,204,0.25)' }}
            >
              立即注册
            </Link>
          )}
        </motion.div>
      </section>
    </div>
  );
}
