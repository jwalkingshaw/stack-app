'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

// Types
export interface BlogPost {
  _id: string
  title: string
  slug: {
    current: string
  }
  excerpt?: string
  coverImage?: {
    asset?: {
      _id: string
      url: string
    }
    alt?: string
  }
  author?: {
    name: string
    image?: any
  }
  publishedAt: string
  tags?: string[]
  estimatedReadingTime?: number
}

export interface NewsFeedProps {
  client: any // Sanity client
  BlogPostCard: React.ComponentType<{ post: BlogPost }>
  Pagination?: {
    Pagination: React.ComponentType<{ children: React.ReactNode }>
    PaginationContent: React.ComponentType<{ children: React.ReactNode }>
    PaginationItem: React.ComponentType<{ children: React.ReactNode }>
    PaginationLink: React.ComponentType<{ 
      href: string
      onClick: (e: React.MouseEvent) => void
      isActive?: boolean
      children: React.ReactNode
    }>
    PaginationNext: React.ComponentType<{ 
      href: string
      onClick: (e: React.MouseEvent) => void
      className?: string
      children?: React.ReactNode
    }>
    PaginationPrevious: React.ComponentType<{ 
      href: string
      onClick: (e: React.MouseEvent) => void
      className?: string
      children?: React.ReactNode
    }>
  }
  postsPerPage?: number
  className?: string
  showPagination?: boolean
}

export default function NewsFeed({
  client,
  BlogPostCard,
  Pagination,
  postsPerPage = 6,
  className = '',
  showPagination = true
}: NewsFeedProps) {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const [totalPosts, setTotalPosts] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)

  const router = useRouter()
  const searchParams = useSearchParams()

  const fetchPosts = useCallback(async (page: number) => {
    setLoading(true)

    try {
      const offset = (page - 1) * postsPerPage
      
      // Get total count and posts in parallel
      const [postsResult, countResult] = await Promise.all([
        client.fetch(`
          *[_type == "blogPost"] | order(publishedAt desc) [${offset}...${offset + postsPerPage}] {
            _id,
            title,
            slug,
            excerpt,
            coverImage {
              asset->{
                _id,
                url
              },
              alt
            },
            author->{
              name,
              image
            },
            publishedAt,
            tags,
            estimatedReadingTime
          }
        `),
        client.fetch(`count(*[_type == "blogPost"])`)
      ])

      setPosts(postsResult || [])
      setTotalPosts(countResult || 0)
    } catch (error) {
      console.error('Error fetching posts:', error)
      setPosts([])
      setTotalPosts(0)
    } finally {
      setLoading(false)
    }
  }, [client, postsPerPage])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', page.toString())
    router.push(`?${params.toString()}`, { scroll: false })
    fetchPosts(page)
  }

  useEffect(() => {
    const pageParam = searchParams.get('page')
    const initialPage = pageParam ? parseInt(pageParam) : 1
    setCurrentPage(initialPage)
    fetchPosts(initialPage)
  }, [searchParams, fetchPosts])

  const totalPages = Math.ceil(totalPosts / postsPerPage)

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="space-y-6">
        {posts.map((post) => (
          <BlogPostCard key={post._id} post={post} />
        ))}
      </div>

      {showPagination && Pagination && totalPages > 1 && (
        <div className="mt-12">
          <Pagination.Pagination>
            <Pagination.PaginationContent>
              <Pagination.PaginationItem>
                <Pagination.PaginationPrevious 
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    if (currentPage > 1) handlePageChange(currentPage - 1)
                  }}
                  className={currentPage <= 1 ? 'pointer-events-none opacity-50' : ''}
                >
                  Previous
                </Pagination.PaginationPrevious>
              </Pagination.PaginationItem>
              
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <Pagination.PaginationItem key={page}>
                  <Pagination.PaginationLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      handlePageChange(page)
                    }}
                    isActive={currentPage === page}
                  >
                    {page}
                  </Pagination.PaginationLink>
                </Pagination.PaginationItem>
              ))}
              
              <Pagination.PaginationItem>
                <Pagination.PaginationNext 
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    if (currentPage < totalPages) handlePageChange(currentPage + 1)
                  }}
                  className={currentPage >= totalPages ? 'pointer-events-none opacity-50' : ''}
                >
                  Next
                </Pagination.PaginationNext>
              </Pagination.PaginationItem>
            </Pagination.PaginationContent>
          </Pagination.Pagination>
        </div>
      )}
    </div>
  )
}