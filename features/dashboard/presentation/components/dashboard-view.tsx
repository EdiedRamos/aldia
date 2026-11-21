'use client'

import { useMemo, useState } from 'react'

import { formatPeriodLabel } from '@/core/domain/period'
import {
  buildClampedIsoDate,
  buildMonthlyCalendarData,
} from '@/features/dashboard/domain/calendar-aggregator'
import type { DashboardOverview } from '@/features/dashboard/domain/dashboard.types'
import { DashboardCalendar } from '@/features/dashboard/presentation/components/DashboardCalendar'
import { DashboardKpiCards } from '@/features/dashboard/presentation/components/dashboard-kpi-cards'
import { UpcomingRadar } from '@/features/dashboard/presentation/components/upcoming-radar'

interface DashboardViewProps {
  overview: DashboardOverview
}

export function DashboardView({ overview }: DashboardViewProps) {
  const { initialCalendar, upcomingEvents, upcoming3DaysCount, sourceData } =
    overview

  const [selectedYear, setSelectedYear] = useState(initialCalendar.year)
  const [selectedMonth, setSelectedMonth] = useState(initialCalendar.month)
  const [selectedDate, setSelectedDate] = useState(initialCalendar.todayIso)

  const currentCalendar = useMemo(() => {
    if (
      selectedYear === initialCalendar.year &&
      selectedMonth === initialCalendar.month
    ) {
      return initialCalendar
    }

    return buildMonthlyCalendarData({
      month: selectedMonth,
      year: selectedYear,
      services: sourceData.services,
      servicePayments: sourceData.servicePayments,
      loans: sourceData.loans,
      contacts: sourceData.contacts,
      referenceDate: initialCalendar.todayIso,
    })
  }, [
    selectedYear,
    selectedMonth,
    initialCalendar,
    sourceData.services,
    sourceData.servicePayments,
    sourceData.loans,
    sourceData.contacts,
  ])

  const [todayYear, todayMonth] = initialCalendar.todayIso
    .split('-')
    .map(Number)

  function navigateToMonth(nextYear: number, nextMonth: number) {
    setSelectedYear(nextYear)
    setSelectedMonth(nextMonth)

    if (nextYear === todayYear && nextMonth === todayMonth) {
      setSelectedDate(initialCalendar.todayIso)
    } else {
      setSelectedDate(buildClampedIsoDate(nextYear, nextMonth, 1))
    }
  }

  function handlePrevMonth() {
    if (selectedMonth === 1) {
      navigateToMonth(selectedYear - 1, 12)
    } else {
      navigateToMonth(selectedYear, selectedMonth - 1)
    }
  }

  function handleNextMonth() {
    if (selectedMonth === 12) {
      navigateToMonth(selectedYear + 1, 1)
    } else {
      navigateToMonth(selectedYear, selectedMonth + 1)
    }
  }

  function handleGoToToday() {
    setSelectedYear(todayYear)
    setSelectedMonth(todayMonth)
    setSelectedDate(initialCalendar.todayIso)
  }

  function handleJumpToDate(isoDate: string) {
    const [targetYear, targetMonth] = isoDate.split('-').map(Number)
    setSelectedYear(targetYear)
    setSelectedMonth(targetMonth)
    setSelectedDate(isoDate)
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <DashboardKpiCards
        summary={currentCalendar.summary}
        upcoming3DaysCount={upcoming3DaysCount}
        periodLabel={formatPeriodLabel(currentCalendar.period)}
      />

      <DashboardCalendar
        calendar={currentCalendar}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onGoToToday={handleGoToToday}
      />

      <UpcomingRadar
        events={upcomingEvents}
        todayIso={initialCalendar.todayIso}
        onSelectDate={handleJumpToDate}
      />
    </div>
  )
}
