import React, { useState, useEffect, useMemo } from 'react';
import { App, TFolder } from 'obsidian';
import { ProjectManager } from '../../utils/projectManager';
import { Target, Calendar, TrendingUp, Clock, AlertCircle } from 'lucide-react';

interface StatisticsProps {
    app: App;
    project: TFolder;
}

export const Statistics: React.FC<StatisticsProps> = ({ app, project }) => {
    const pm = useMemo(() => new ProjectManager(app), [app]);
    const [meta, setMeta] = useState(pm.getProjectMetadata(project));
    const [currentWordCount, setCurrentWordCount] = useState(0);
    const [todayCount, setTodayCount] = useState(0);

    const refresh = async () => {
        const newMeta = pm.getProjectMetadata(project);
        setMeta(newMeta);
        const count = await pm.getProjectWordCount(project);
        setCurrentWordCount(count);
        
        // Get today's count from history if available
        const todayStr = new Date().toISOString().split('T')[0];
        setTodayCount(newMeta?.writingHistory?.[todayStr] || 0);
    };

    useEffect(() => {
        refresh();
        const events = [
            app.vault.on('modify', () => { 
                // Debounce refresh slightly to avoid thrashing on typing
                setTimeout(refresh, 2000); 
            }),
            app.metadataCache.on('changed', (f) => {
                if (f.name === 'project.md' && f.parent?.path === project.path) refresh();
            })
        ];
        return () => events.forEach(ref => app.vault.offref(ref as any));
    }, [project]);

    // Metrics Calculation
    const target = meta?.targetWordCount || 0;
    const deadline = meta?.targetDeadline ? new Date(meta.targetDeadline) : null;
    const progressPercent = target > 0 ? Math.min(100, Math.round((currentWordCount / target) * 100)) : 0;

    const daysRemaining = useMemo(() => {
        if (!deadline) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize today to the beginning of the day
        const deadlineDate = new Date(deadline);
        deadlineDate.setHours(0, 0, 0, 0); // Normalize deadline to the beginning of the day
        const diffTime = deadlineDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        return Math.max(0, diffDays);
    }, [deadline]);

    const wordsPerDayNeeded = useMemo(() => {
        if (daysRemaining === null || daysRemaining <= 0 || target === 0) return 0;
        const remainingWords = Math.max(0, target - currentWordCount);
        return Math.ceil(remainingWords / daysRemaining);
    }, [daysRemaining, target, currentWordCount]);

    const streak = useMemo(() => {
        if (!meta?.writingHistory) return 0;
        
        let streakCount = 0;
        const history = meta.writingHistory;
        const d = new Date();

        const todayStr = d.toISOString().split('T')[0];
        if (!history[todayStr] || history[todayStr] === 0) {
            d.setDate(d.getDate() - 1);
        }

        while (true) {
            const dStr = d.toISOString().split('T')[0];
            if ((history[dStr] || 0) > 0) {
                streakCount++;
                d.setDate(d.getDate() - 1);
            } else {
                break;
            }
        }
        return streakCount;
    }, [meta?.writingHistory]);


    // Sort history for display (newest first)
    const historyEntries = useMemo(() => {
        if (!meta?.writingHistory) return [];
        return Object.entries(meta.writingHistory)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, 30); // Show last 30 entries
    }, [meta?.writingHistory]);

    return (
        <div className="novelist-stats-container">
            <h2 className="novelist-stats-header">
                Statistics for "{project.name}"
            </h2>

            <div className="novelist-stats-grid">
                {/* 1. Main Progress */}
                <div className="novelist-stat-card full-width">
                    <div className="stat-card-title"><Target size={16}/> Manuscript Progress</div>
                    <div className="stat-big-number">{currentWordCount.toLocaleString()} <span className="stat-sub">/ {target > 0 ? target.toLocaleString() : '...'} words</span></div>
                    <div className="novelist-progress-bar-bg huge">
                        <div className="novelist-progress-bar-fill" style={{width: `${progressPercent}%`}}></div>
                    </div>
                    <div className="stat-footer-text">{progressPercent}% Completed</div>
                </div>

                {/* 2. Today's Session */}
                <div className="novelist-stat-card">
                    <div className="stat-card-title"><Clock size={16}/> Today's Session</div>
                    <div className="stat-big-number">{todayCount.toLocaleString()}</div>
                    <div className="stat-footer-text">words written today</div>
                </div>

                {/* 3. Streak */}
                <div className="novelist-stat-card">
                    <div className="stat-card-title"><TrendingUp size={16}/> Writing Streak</div>
                    <div className="stat-big-number">{streak}</div>
                    <div className="stat-footer-text">consecutive days</div>
                </div>

                {/* 4. Deadline Metrics */}
                {deadline ? (
                    <div className="novelist-stat-card full-width deadline-card">
                        <div className="stat-columns">
                            <div>
                                <div className="stat-card-title"><Calendar size={16}/> Days Remaining</div>
                                <div className="stat-big-number">{daysRemaining}</div>
                                <div className="stat-footer-text">until {deadline.toLocaleDateString()}</div>
                            </div>
                            <div className="stat-separator-vertical"></div>
                            <div>
                                <div className="stat-card-title"><AlertCircle size={16}/> Daily Goal</div>
                                <div className="stat-big-number">{wordsPerDayNeeded?.toLocaleString() || 0}</div>
                                <div className="stat-footer-text">words/day to finish on time</div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="novelist-stat-card full-width" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)'}}>
                        <div style={{textAlign: 'center'}}>
                            <Calendar size={24} style={{marginBottom: 5, opacity: 0.5}}/>
                            <div>Set a deadline in Project Settings to see forecasts.</div>
                        </div>
                    </div>
                )}
            </div>

            <h3 className="novelist-stats-subheader">Writing History (Last 30 Days)</h3>
            <div className="novelist-history-table-wrapper">
                <table className="novelist-history-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Words Written</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historyEntries.length > 0 ? (
                            historyEntries.map(([date, count]) => (
                                <tr key={date}>
                                    <td>{new Date(date).toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'})}</td>
                                    <td>{count.toLocaleString()}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={2} style={{textAlign: 'center', color: 'var(--text-muted)'}}>No writing history yet.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};