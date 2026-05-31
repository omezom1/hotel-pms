declare module 'react-date-range' {
  import { ComponentType } from 'react'

  export interface Range {
    startDate?: Date
    endDate?: Date
    key?: string
    color?: string
    autoFocus?: boolean
    disabled?: boolean
    showDateDisplay?: boolean
  }

  export interface DateRangeProps {
    ranges: Range[]
    onChange: (ranges: { [key: string]: Range }) => void
    months?: number
    direction?: 'horizontal' | 'vertical'
    locale?: object
    minDate?: Date
    maxDate?: Date
    showDateDisplay?: boolean
    showMonthAndYearPickers?: boolean
    rangeColors?: string[]
    color?: string
    className?: string
  }

  export const DateRange: ComponentType<DateRangeProps>
}
