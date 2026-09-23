/** Where the month goes in a MonthJump link-mode href.
 *
 *  Its own module rather than an export of MonthJump: everything a
 *  'use client' file exports reaches a server component as a stub that
 *  throws when called, never as its value. Importing it from there handed
 *  CourseCalendar a function, so the href carried that function's source
 *  where the month should be and every jump landed back on today.
 */
export const YM = '__ym__'
