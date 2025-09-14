'use client'

import Image from 'next/image'
import Link from 'next/link'
import { BlogPost } from '@tradetool/shared-components'

interface BlogPostCardProps {
  post: BlogPost
}

export default function BlogPostCard({ post }: BlogPostCardProps) {
  const getImageUrl = () => {
    if (!post.coverImage?.asset?.url) return null
    return post.coverImage.asset.url
  }
  
  const imageUrl = getImageUrl()
  
  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <article className="overflow-hidden border border-border rounded-lg bg-card hover:shadow-md transition-shadow">
      {imageUrl && (
        <div className="relative h-48 overflow-hidden group">
          <Link href={`https://stackcess.com/post/${post.slug.current}`} target="_blank">
            <Image
              src={imageUrl}
              alt={post.coverImage?.alt || post.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </Link>
        </div>
      )}
      
      <div className="p-6">
        <div className="flex items-center space-x-2 mb-3">
          {post.tags && post.tags.slice(0, 2).map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
            >
              {tag}
            </span>
          ))}
        </div>

        <Link href={`https://stackcess.com/post/${post.slug.current}`} target="_blank">
          <h2 className="text-xl font-semibold text-foreground mb-3 line-clamp-2 hover:text-primary transition-colors">
            {post.title}
          </h2>
        </Link>

        {post.excerpt && (
          <p className="text-muted-foreground mb-4 line-clamp-3">
            {post.excerpt}
          </p>
        )}

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center space-x-2">
            {post.author && (
              <span>{post.author.name}</span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            {post.estimatedReadingTime && (
              <span>{post.estimatedReadingTime} min read</span>
            )}
            <time dateTime={post.publishedAt}>
              {formatDate(post.publishedAt)}
            </time>
          </div>
        </div>
      </div>
    </article>
  )
}