import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../auth";
import type { Comment, Post, PostList } from "../types";

const allPostsKey = ["posts"];
const postListKey = ["posts", "list"];
const postDetailKey = (id: number) => ["posts", "detail", id];
const postCommentsKey = (postId: number) => ["posts", "comments", postId];

export const usePosts = (page: number) =>
  useQuery({
    queryKey: [...postListKey, page],
    queryFn: ({ signal }) =>
      apiRequest<PostList>(`/api/posts?page=${page}`, { signal }),
  });

export const usePost = (id: number, forEdit = false) =>
  useQuery({
    queryKey: postDetailKey(id),
    queryFn: ({ signal }) => apiRequest<Post>(`/api/posts/${id}`, { signal }),
    refetchOnMount: forEdit ? "always" : false,
  });

export const useComments = (postId: number) =>
  useQuery({
    queryKey: postCommentsKey(postId),
    queryFn: ({ signal }) =>
      apiRequest<Comment[]>(`/api/posts/${postId}/comments`, { signal }),
  });

export const useSavePost = (id?: number) => {
  const queryClient = useQueryClient();
  const isNew = id === undefined;
  return useMutation({
    mutationFn: (body: { title: string; content: string }) =>
      apiRequest<Post>(isNew ? "/api/posts" : `/api/posts/${id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async (post) => {
      const detailKey = postDetailKey(post.id);
      await queryClient.cancelQueries({ queryKey: detailKey });
      queryClient.setQueryData(detailKey, post);
      await queryClient.cancelQueries({ queryKey: postListKey });
      void queryClient.invalidateQueries({ queryKey: postListKey });
    },
  });
};

export const useDeletePost = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<null>(`/api/posts/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: allPostsKey });
      void queryClient.invalidateQueries({ queryKey: allPostsKey });
    },
  });
};

const useInvalidateComments = (postId: number) => {
  const queryClient = useQueryClient();
  return async () => {
    const commentsKey = postCommentsKey(postId);
    await Promise.all([
      queryClient.cancelQueries({ queryKey: commentsKey }),
      queryClient.cancelQueries({ queryKey: postListKey }),
    ]);
    void queryClient.invalidateQueries({ queryKey: commentsKey });
    void queryClient.invalidateQueries({ queryKey: postListKey });
  };
};

export const useAddComment = (postId: number) => {
  const invalidateComments = useInvalidateComments(postId);
  return useMutation({
    mutationFn: (content: string) =>
      apiRequest<Comment>(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    onSuccess: invalidateComments,
  });
};

export const useUpdateComment = (postId: number) => {
  const invalidateComments = useInvalidateComments(postId);
  return useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      apiRequest<Comment>(`/api/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    onSuccess: invalidateComments,
  });
};

export const useDeleteComment = (postId: number) => {
  const invalidateComments = useInvalidateComments(postId);
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<null>(`/api/comments/${id}`, { method: "DELETE" }),
    onSuccess: invalidateComments,
  });
};
