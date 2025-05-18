import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface BlogPost {
  id: string;
  slug: string;
  title: string;
  content: string;
  images: string[];
  videos: string[];
  reels: string[];
  created_at: string;
}

const BlogPost: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPost = async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('blog_posts')
        .select('*')
        .eq('slug', slug)
        .single();
      if (error) {
        setError('Blog post not found.');
      } else {
        setPost(data);
      }
      setLoading(false);
    };
    if (slug) fetchPost();
  }, [slug]);

  if (loading) {
    return <div className="container mx-auto px-4 py-16 text-center text-lg">Loading...</div>;
  }
  if (error || !post) {
    return <div className="container mx-auto px-4 py-16 text-center text-error-500">{error || 'Not found.'}</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <article className="prose prose-invert lg:prose-xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">{post.title}</h1>
        {/* Media Gallery */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {post.images && post.images.map((img, i) => (
            <img key={i} src={img} alt={post.title + ' image'} className="rounded-xl w-full object-cover" />
          ))}
          {post.videos && post.videos.map((vid, i) => (
            <div key={vid + i} className="aspect-video w-full rounded-xl overflow-hidden">
              <iframe
                src={vid}
                title={`Video ${i + 1}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          ))}
          {post.reels && post.reels.map((reel, i) => (
            <div key={reel + i} className="aspect-video w-full rounded-xl overflow-hidden">
              <iframe
                src={reel}
                title={`Reel ${i + 1}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          ))}
        </div>
        {/* Blog Content */}
        <div dangerouslySetInnerHTML={{ __html: post.content }} />
      </article>
      <div className="mt-12 text-sm text-gray-500 text-center">Published on {new Date(post.created_at).toLocaleDateString()}</div>
    </div>
  );
};

export default BlogPost;