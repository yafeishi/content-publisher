'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
    ChevronLeft,
    ChevronRight,
    Plus,
    FileText,
    Calendar as CalendarIcon,
    Clock,
    X,
} from 'lucide-react';
import solarLunar from 'solarlunar';
import chineseWorkday from 'chinese-workday';
import { platformLabel, PUBLISHING_PLATFORMS } from '@/lib/publishing-platforms';

interface ContentItem {
    id: string;
    title: string;
    status: string;
    scheduledAt: string | null;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
    platforms: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400', label: '草稿' },
    published: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500', label: '已发布' },
    scheduled: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500', label: '定时' },
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

const getPlatformDisplayName = (platform: string) => platformLabel(platform, 'short');

function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
    return new Date(year, month, 1).getDay();
}

interface CalendarDayMeta {
    lunarText: string;
    holidayLabel: string | null;
    isHoliday: boolean;
    isAdditionalWorkday: boolean;
}

export default function CalendarPage() {
    const today = new Date();
    const [currentYear, setCurrentYear] = useState(today.getFullYear());
    const [currentMonth, setCurrentMonth] = useState(today.getMonth());
    const [contents, setContents] = useState<ContentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedPlatform, setSelectedPlatform] = useState('all');

    useEffect(() => {
        fetchContents();
    }, []);

    const fetchContents = async () => {
        try {
            const res = await fetch('/api/content');
            if (res.ok) {
                const data = await res.json();
                setContents(data);
            }
        } catch (error) {
            console.error('Failed to fetch contents:', error);
        } finally {
            setLoading(false);
        }
    };

    const goToPrevMonth = () => {
        if (currentMonth === 0) {
            setCurrentMonth(11);
            setCurrentYear((y) => y - 1);
        } else {
            setCurrentMonth((m) => m - 1);
        }
    };

    const goToNextMonth = () => {
        if (currentMonth === 11) {
            setCurrentMonth(0);
            setCurrentYear((y) => y + 1);
        } else {
            setCurrentMonth((m) => m + 1);
        }
    };

    const goToToday = () => {
        setCurrentYear(today.getFullYear());
        setCurrentMonth(today.getMonth());
    };

    const parsePlatforms = (platformsRaw: string) => {
        try {
            const parsed: unknown = JSON.parse(platformsRaw || '[]');
            if (!Array.isArray(parsed)) return [];
            return parsed.filter((item): item is string => typeof item === 'string');
        } catch {
            return [];
        }
    };

    const filteredContents = selectedPlatform === 'all'
        ? contents
        : contents.filter((c) => parsePlatforms(c.platforms).includes(selectedPlatform));

    // Group content by date
    const contentByDate: Record<string, ContentItem[]> = {};
    filteredContents.forEach((c) => {
        // Use the most relevant date based on status
        let dateStr: string;
        if (c.status === 'published' && c.publishedAt) {
            dateStr = new Date(c.publishedAt).toISOString().split('T')[0];
        } else if (c.status === 'scheduled' && c.scheduledAt) {
            dateStr = new Date(c.scheduledAt).toISOString().split('T')[0];
        } else {
            dateStr = new Date(c.updatedAt).toISOString().split('T')[0];
        }
        if (!contentByDate[dateStr]) {
            contentByDate[dateStr] = [];
        }
        contentByDate[dateStr].push(c);
    });

    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

    // Build calendar grid
    const calendarDays: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) {
        calendarDays.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
        calendarDays.push(d);
    }
    // Fill remaining cells
    while (calendarDays.length % 7 !== 0) {
        calendarDays.push(null);
    }

    const isToday = (day: number) =>
        day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();

    const getDateKey = (day: number) => {
        const m = String(currentMonth + 1).padStart(2, '0');
        const d = String(day).padStart(2, '0');
        return `${currentYear}-${m}-${d}`;
    };

    const selectedContents = selectedDate ? contentByDate[selectedDate] || [] : [];

    const selectedDayMeta = useMemo<CalendarDayMeta | null>(() => {
        if (!selectedDate) return null;
        const [y, m, d] = selectedDate.split('-').map((item) => Number(item));
        if (!y || !m || !d) return null;
        const lunarInfo = solarLunar.solar2lunar(y, m, d);
        const holidayName = chineseWorkday.getFestival(selectedDate);
        const isHoliday = Boolean(chineseWorkday.isHoliday(selectedDate));
        const isAdditionalWorkday = typeof chineseWorkday.isAddtionalWorkday === 'function'
            ? Boolean(chineseWorkday.isAddtionalWorkday(selectedDate))
            : false;
        return {
            lunarText: lunarInfo?.isTerm
                ? lunarInfo.term
                : (lunarInfo?.dayCn === '初一' ? lunarInfo.monthCn : lunarInfo?.dayCn || ''),
            holidayLabel: holidayName || null,
            isHoliday,
            isAdditionalWorkday,
        };
    }, [selectedDate]);

    // Calculate monthly stats
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const monthContents = filteredContents.filter((c) => {
        let dateStr: string;
        if (c.status === 'published' && c.publishedAt) {
            dateStr = new Date(c.publishedAt).toISOString().split('T')[0];
        } else if (c.status === 'scheduled' && c.scheduledAt) {
            dateStr = new Date(c.scheduledAt).toISOString().split('T')[0];
        } else {
            dateStr = new Date(c.updatedAt).toISOString().split('T')[0];
        }
        return dateStr.startsWith(monthPrefix);
    });
    const monthPublished = monthContents.filter((c) => c.status === 'published').length;
    const monthScheduled = monthContents.filter((c) => c.status === 'scheduled').length;
    const monthDrafts = monthContents.filter((c) => c.status === 'draft').length;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-gray-300 animate-pulse" />
                    <p className="theme-muted">加载中...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="theme-panel flex items-center justify-between p-6">
                <div>
                    <h1 className="page-title">内容日历</h1>
                    <p className="page-subtitle">规划和管理内容发布排期</p>
                </div>
                <Link
                    href="/content/new"
                    className="button-primary flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
                >
                    <Plus className="h-4 w-4" />
                    新建内容
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Calendar */}
                <div className="lg:col-span-3">
                    <div className="theme-card overflow-hidden">
                        {/* Month navigation */}
                        <div className="flex items-center justify-between p-4 border-b border-gray-200">
                            <div className="flex items-center gap-3">
                                <h2 className="text-lg font-semibold theme-title">
                                    {currentYear}年 {MONTHS[currentMonth]}
                                </h2>
                                <button
                                    onClick={goToToday}
                                    className="px-3 py-1 text-xs text-blue-600 border border-blue-200 rounded-full hover:bg-blue-50 transition-colors"
                                >
                                    今天
                                </button>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={goToPrevMonth}
                                    className="p-2 theme-muted hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <ChevronLeft className="h-5 w-5" />
                                </button>
                                <button
                                    onClick={goToNextMonth}
                                    className="p-2 theme-muted hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    <ChevronRight className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        {/* Platform filters */}
                        <div className="p-3 border-b border-gray-100">
                            <div className="flex flex-wrap items-center gap-2">
                                {[
                                    { value: 'all', label: '全部渠道' },
                                    ...PUBLISHING_PLATFORMS.map((item) => ({ value: item.id, label: item.shortLabel })),
                                ].map((item) => {
                                    const isActive = selectedPlatform === item.value;
                                    return (
                                        <button
                                            key={item.value}
                                            onClick={() => setSelectedPlatform(item.value)}
                                            className={`px-3 py-1.5 text-xs rounded-full transition-colors ${isActive
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                }`}
                                        >
                                            {item.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Weekday headers */}
                        <div className="grid grid-cols-7 border-b border-gray-100">
                            {WEEKDAYS.map((day) => (
                                <div
                                    key={day}
                                    className="py-3 text-center text-xs font-medium theme-muted uppercase"
                                >
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Calendar grid */}
                        <div className="grid grid-cols-7">
                            {calendarDays.map((day, index) => {
                                if (day === null) {
                                    return (
                                        <div
                                            key={`empty-${index}`}
                                            className="min-h-[100px] border-b border-r border-gray-50 bg-gray-50/30"
                                        />
                                    );
                                }

                                const dateKey = getDateKey(day);
                                const dayContents = contentByDate[dateKey] || [];
                                const isTodayDate = isToday(day);
                                const isSelected = selectedDate === dateKey;
                                const lunarInfo = solarLunar.solar2lunar(currentYear, currentMonth + 1, day);
                                const holidayName = chineseWorkday.getFestival(dateKey);
                                const isHoliday = Boolean(chineseWorkday.isHoliday(dateKey));
                                const isAdditionalWorkday = typeof chineseWorkday.isAddtionalWorkday === 'function'
                                    ? Boolean(chineseWorkday.isAddtionalWorkday(dateKey))
                                    : false;
                                const lunarText = lunarInfo?.isTerm
                                    ? lunarInfo.term
                                    : (lunarInfo?.dayCn === '初一' ? lunarInfo.monthCn : lunarInfo?.dayCn || '');

                                return (
                                    <button
                                        key={dateKey}
                                        onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                                        className={`min-h-[100px] border-b border-r border-gray-100 p-2 text-left hover:bg-blue-50/50 transition-colors ${isSelected ? 'bg-blue-50 ring-1 ring-blue-200 ring-inset' : ''
                                            }`}
                                    >
                                        <span
                                            className={`inline-flex items-center justify-center w-7 h-7 text-sm rounded-full ${isTodayDate
                                                    ? 'bg-blue-600 text-white font-bold'
                                                    : 'text-gray-700'
                                                }`}
                                        >
                                            {day}
                                        </span>
                                        <div className="mt-0.5 flex items-center gap-1 min-h-4">
                                            <span className="text-[10px] text-gray-400 truncate">
                                                {lunarText}
                                            </span>
                                            {isHoliday && (
                                                <span className="text-[10px] px-1 rounded bg-red-100 text-red-600 flex-shrink-0">
                                                    休
                                                </span>
                                            )}
                                            {isAdditionalWorkday && (
                                                <span className="text-[10px] px-1 rounded bg-amber-100 text-amber-700 flex-shrink-0">
                                                    班
                                                </span>
                                            )}
                                        </div>
                                        {holidayName && (
                                            <div className="text-[10px] text-red-500 truncate">
                                                {holidayName}
                                            </div>
                                        )}

                                        {/* Content indicators */}
                                        {dayContents.length > 0 && (
                                            <div className="mt-1 space-y-1">
                                                {dayContents.slice(0, 3).map((c) => {
                                                    const statusInfo = STATUS_COLORS[c.status] || STATUS_COLORS.draft;
                                                    return (
                                                        <div
                                                            key={c.id}
                                                            className={`text-[10px] px-1.5 py-0.5 rounded truncate ${statusInfo.bg} ${statusInfo.text}`}
                                                        >
                                                            {c.title || '无标题'}
                                                        </div>
                                                    );
                                                })}
                                                {dayContents.length > 3 && (
                                                    <div className="text-[10px] theme-muted px-1.5">
                                                        +{dayContents.length - 3} 更多
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Monthly stats */}
                    <div className="theme-card p-5">
                        <h3 className="font-semibold theme-title mb-4">本月统计</h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                                    <span className="text-sm text-gray-600">已发布</span>
                                </div>
                                <span className="text-sm font-semibold theme-title">{monthPublished}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                                    <span className="text-sm text-gray-600">定时发布</span>
                                </div>
                                <span className="text-sm font-semibold theme-title">{monthScheduled}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
                                    <span className="text-sm text-gray-600">草稿</span>
                                </div>
                                <span className="text-sm font-semibold theme-title">{monthDrafts}</span>
                            </div>
                            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">合计</span>
                                <span className="text-sm font-bold theme-title">{monthContents.length}</span>
                            </div>
                        </div>
                    </div>

                    {/* Selected date detail */}
                    <div className="theme-card p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold theme-title">
                                {selectedDate
                                    ? `${new Date(selectedDate + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} 内容`
                                    : '选择日期查看详情'}
                            </h3>
                            {selectedDate && (
                                <button
                                    onClick={() => setSelectedDate(null)}
                                    className="p-1 theme-muted hover:text-gray-600 rounded"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        {selectedDate && selectedDayMeta && (
                            <div className="mb-3 flex items-center gap-2 flex-wrap">
                                {selectedDayMeta.lunarText && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                                        农历 {selectedDayMeta.lunarText}
                                    </span>
                                )}
                                {selectedDayMeta.isHoliday && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-600">
                                        法定节假日
                                    </span>
                                )}
                                {selectedDayMeta.isAdditionalWorkday && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                                        补班
                                    </span>
                                )}
                                {selectedDayMeta.holidayLabel && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-500">
                                        {selectedDayMeta.holidayLabel}
                                    </span>
                                )}
                            </div>
                        )}

                        {selectedDate ? (
                            selectedContents.length > 0 ? (
                                <div className="space-y-2">
                                    {selectedContents.map((c) => {
                                        const statusInfo = STATUS_COLORS[c.status] || STATUS_COLORS.draft;
                                        const platforms = parsePlatforms(c.platforms);

                                        return (
                                            <Link
                                                key={c.id}
                                                href={`/content/${c.id}`}
                                                className="block p-3 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/50 transition-colors"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="text-sm font-medium theme-title line-clamp-2">
                                                        {c.title || '无标题'}
                                                    </p>
                                                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full flex-shrink-0 ${statusInfo.bg} ${statusInfo.text}`}>
                                                        {statusInfo.label}
                                                    </span>
                                                </div>
                                                {platforms.length > 0 && (
                                                    <div className="flex items-center gap-1 mt-2">
                                                        {platforms.map((p: string) => (
                                                            <span key={p} className="text-[10px] px-1.5 py-0.5 bg-gray-100 theme-muted rounded">
                                                                {getPlatformDisplayName(p)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                {c.status === 'scheduled' && c.scheduledAt && (
                                                    <div className="flex items-center gap-1 mt-2 text-[10px] text-blue-600">
                                                        <Clock className="h-3 w-3" />
                                                        {new Date(c.scheduledAt).toLocaleString('zh-CN')}
                                                    </div>
                                                )}
                                            </Link>
                                        );
                                    })}
                                    <Link
                                        href="/content/new"
                                        className="flex items-center justify-center gap-1 p-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        在此日期新建内容
                                    </Link>
                                </div>
                            ) : (
                                <div className="text-center py-6">
                                    <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                    <p className="text-sm theme-muted mb-3">该日期暂无内容</p>
                                    <Link
                                        href="/content/new"
                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        新建内容
                                    </Link>
                                </div>
                            )
                        ) : (
                            <div className="text-center py-6">
                                <CalendarIcon className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                                <p className="text-sm theme-muted">点击日历上的日期</p>
                                <p className="text-xs text-gray-300 mt-1">查看当天的发布计划</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
