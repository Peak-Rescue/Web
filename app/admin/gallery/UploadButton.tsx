'use client'

import { useFormStatus } from 'react-dom'

export function UploadButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-pr-red hover:bg-pr-red-dark disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors cursor-pointer"
    >
      {pending ? 'Uploading…' : 'Upload photos'}
    </button>
  )
}
