import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { getPostBySlug, posts } from '@/lib/data/posts'
import type { Metadata } from 'next'

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return {}
  return {
    title: post.title,
    description: post.excerpt,
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  return (
    <>
      {/* Hero */}
      <div className="relative bg-pr-surface border-b border-white/[0.06] overflow-hidden">
        <div className="absolute top-0 left-0 w-48 h-1 bg-pr-red z-10" />

        {post.image ? (
          <>
            <div className="relative w-full h-64 md:h-80 lg:h-96">
              <Image
                src={post.image}
                alt={post.title}
                fill
                priority
                className="object-cover object-center"
                sizes="100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-pr-bg via-pr-bg/50 to-transparent" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 pb-12">
              <div className="site-container">
                <Link
                  href="/blog"
                  className="text-xs font-display tracking-widest uppercase text-pr-muted hover:text-pr-text transition-colors"
                >
                  ← Field Notes
                </Link>
                <time className="block section-label mt-6">{post.date}</time>
                <h1 className="display-lg mt-3 text-pr-text max-w-3xl">{post.title}</h1>
              </div>
            </div>
          </>
        ) : (
          <div className="pt-32 pb-16 site-container">
            <Link
              href="/blog"
              className="text-xs font-display tracking-widest uppercase text-pr-muted hover:text-pr-text transition-colors"
            >
              ← Field Notes
            </Link>
            <time className="block section-label mt-6">{post.date}</time>
            <h1 className="display-lg mt-3 text-pr-text max-w-3xl">{post.title}</h1>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="py-20 bg-pr-bg">
        <div className="site-container">
          <div className="max-w-2xl">
            {post.body.map((paragraph, i) => (
              <p key={i} className="text-pr-muted leading-relaxed text-lg mb-6">
                {paragraph}
              </p>
            ))}
          </div>

          <div className="mt-16 pt-8 border-t border-white/[0.06]">
            <Link
              href="/blog"
              className="text-sm font-display font-600 tracking-widest uppercase text-pr-red hover:text-pr-red-light transition-colors"
            >
              ← Back to Field Notes
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
