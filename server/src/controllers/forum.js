const Subspace = require("../models/Subspace");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const {
  getCache,
  setCache,
  invalidateCache,
  CACHE_KEYS,
  CACHE_TTL,
} = require("../middleware/cache");

async function findSubspaceByIdentifier(rawIdentifier) {
  const identifier = (rawIdentifier || "").trim();
  const normalizedName = identifier.toLowerCase();

  return Subspace.findOne({
    $or: [{ slug: identifier }, { name: normalizedName }],
  }).lean();
}

function sanitizePost(post, userId) {
  const authorId = (
    post.author?._id?.toString() ??
    post.author?.toString() ??
    ""
  );
  const isOwner = !!userId && !!authorId && authorId === userId.toString();

  const hasUpvoted = userId
    ? (post.upvotes ?? []).some((id) => id.toString() === userId.toString())
    : false;

  const author = post.isAnonymous
    ? { displayName: "Anonymous" }
    : post.author ?? { displayName: "Unknown" };

  const { author: _rawAuthor, upvotes: _up, ...rest } = post;

  return {
    ...rest,
    author,
    isOwner,
    hasUpvoted,
  };
}

function sanitizeComment(comment, userId) {
  const authorId = (
    comment.author?._id?.toString() ??
    comment.author?.toString() ??
    ""
  );
  const isOwner = !!userId && !!authorId && authorId === userId.toString();

  if (comment.isAnonymous) {
    const { author: _rawAuthor, ...rest } = comment;
    return {
      ...rest,
      author: { displayName: "Anonymous" },
      isOwner,
    };
  }
  return { ...comment, isOwner };
}

async function createSubspace(req, res) {
  try {
    const { name, description, isPrivate } = req.body;

    if (!name || name.length < 3) {
      return res
        .status(400)
        .json({ error: "Name must be at least 3 characters" });
    }

    const baseName = name.trim().toLowerCase();
    const slug = baseName.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const existing = await Subspace.findOne({
      $or: [{ name: baseName }, { slug }],
    }).lean();

    if (existing) {
      return res.status(400).json({ error: "Subspace already exists" });
    }

    const subspace = await Subspace.create({
      name: baseName,
      slug,
      description,
      isPrivate: isPrivate || false,
      createdBy: req.user._id,
      members: [req.user._id],
      memberCount: 1,
      postCount: 0,
    });

    invalidateCache(CACHE_KEYS.PUBLIC_SUBSPACES);

    res.status(201).json(subspace);
  } catch {
    res.status(500).json({ error: "Failed to create subspace" });
  }
}

async function getSubspaces(req, res) {
  try {
    const cached = await getCache(CACHE_KEYS.PUBLIC_SUBSPACES);
    if (cached) return res.json(cached);

    const subspaces = await Subspace.find({ isPrivate: false })
      .sort({ memberCount: -1 })
      .limit(50)
      .select("name slug memberCount postCount description")
      .lean();

    setCache(CACHE_KEYS.PUBLIC_SUBSPACES, subspaces, CACHE_TTL.PUBLIC_SUBSPACES);

    res.json(subspaces);
  } catch {
    res.status(500).json({ error: "Failed to get subspaces" });
  }
}

async function searchSubspaces(req, res) {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    const subspaces = await Subspace.find({
      name: { $regex: q, $options: "i" },
      isPrivate: false,
    })
      .limit(10)
      .select("name slug memberCount postCount")
      .lean();

    res.json(subspaces);
  } catch {
    res.status(500).json({ error: "Failed to search" });
  }
}

async function getSubspace(req, res) {
  try {
    const subspace = await findSubspaceByIdentifier(req.params.name);
    if (!subspace) return res.status(404).json({ error: "Not found" });

    res.json(subspace);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
}

async function deleteSubspace(req, res) {
  try {
    const subspace = await Subspace.findOne({
      $or: [{ slug: req.params.name }, { name: req.params.name }],
    });

    if (!subspace) return res.status(404).json({ error: "Not found" });

    if (!subspace.createdBy.equals(req.user._id)) {
      return res.status(403).json({ error: "Not allowed" });
    }

    await Post.deleteMany({ subspace: subspace._id });
    await Comment.deleteMany({ subspace: subspace._id });
    await Subspace.deleteOne({ _id: subspace._id });

    invalidateCache(CACHE_KEYS.PUBLIC_SUBSPACES);

    res.json({ deleted: true });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
}

async function joinSubspace(req, res) {
  try {
    const subspace = await Subspace.findOne({
      $or: [{ slug: req.params.name }, { name: req.params.name }],
    });

    if (!subspace) return res.status(404).json({ error: "Not found" });

    if (!subspace.members.includes(req.user._id)) {
      subspace.members.push(req.user._id);
      subspace.memberCount = subspace.members.length;
      await subspace.save();
    }

    invalidateCache(CACHE_KEYS.PUBLIC_SUBSPACES);

    res.json({ joined: true });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
}

async function createPost(req, res) {
  try {
    const { title, content, isAnonymous, tags } = req.body;

    const subspace = await findSubspaceByIdentifier(req.params.name);
    if (!subspace) return res.status(404).json({ error: "Subspace not found" });

    const post = await Post.create({
      title,
      content,
      author: req.user._id,
      subspace: subspace._id,
      isAnonymous: isAnonymous === true || isAnonymous === "true",
      tags: tags || [],
    });

    Subspace.updateOne({ _id: subspace._id }, { $inc: { postCount: 1 } }).catch(
      () => {},
    );

    invalidateCache(CACHE_KEYS.PUBLIC_SUBSPACES);

    res.status(201).json(post);
  } catch {
    res.status(500).json({ error: "Failed to create post" });
  }
}

async function getPosts(req, res) {
  try {
    const subspace = await findSubspaceByIdentifier(req.params.name);
    if (!subspace) return res.status(404).json({ error: "Subspace not found" });

    const sort =
      req.query.sort === "new" ? { createdAt: -1 } : { upvoteCount: -1 };

    const posts = await Post.find({ subspace: subspace._id })
      .sort(sort)
      .limit(50)
      .populate("author", "displayName")
      .populate("subspace", "name slug")
      .lean();

    const userId = req.user?._id?.toString();
    const sanitized = posts.map((p) => sanitizePost(p, userId));

    res.json(sanitized);
  } catch (err) {
    console.error("Error in getPosts:", err);
    res.status(500).json({ error: "Failed" });
  }
}

async function getPost(req, res) {
  try {
    const post = await Post.findById(req.params.postId)
      .populate("author", "displayName")
      .populate("subspace", "name slug")
      .lean();

    if (!post) return res.status(404).json({ error: "Not found" });

    const userId = req.user?._id?.toString();
    res.json(sanitizePost(post, userId));
  } catch (err) {
    console.error("Error in getPost:", err);
    res.status(500).json({ error: "Failed" });
  }
}

async function upvotePost(req, res) {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: "Not found" });

    const userId = req.user._id;
    const has = post.upvotes.includes(userId);

    post.upvotes = has
      ? post.upvotes.filter((id) => !id.equals(userId))
      : [...post.upvotes, userId];

    post.upvoteCount = post.upvotes.length;
    await post.save();

    res.json({ upvoted: !has });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
}

async function deletePost(req, res) {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: "Not found" });

    if (!post.author.equals(req.user._id)) {
      return res.status(403).json({ error: "Not allowed" });
    }

    await Comment.deleteMany({ post: post._id });
    await Post.deleteOne({ _id: post._id });

    Subspace.updateOne(
      { _id: post.subspace },
      { $inc: { postCount: -1 } },
    ).catch(() => {});

    invalidateCache(CACHE_KEYS.PUBLIC_SUBSPACES);

    res.json({ deleted: true });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
}

async function createComment(req, res) {
  try {
    const { content, isAnonymous } = req.body;

    const comment = await Comment.create({
      content,
      author: req.user._id,
      post: req.params.postId,
      isAnonymous: isAnonymous === true || isAnonymous === "true",
    });

    Post.updateOne(
      { _id: req.params.postId },
      { $inc: { commentCount: 1 } },
    ).catch(() => {});

    res.status(201).json(comment);
  } catch {
    res.status(500).json({ error: "Failed" });
  }
}

async function deleteComment(req, res) {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) return res.status(404).json({ error: "Not found" });

    if (!comment.author.equals(req.user._id)) {
      return res.status(403).json({ error: "Not allowed" });
    }

    await Comment.deleteOne({ _id: comment._id });

    Post.updateOne(
      { _id: comment.post },
      { $inc: { commentCount: -1 } },
    ).catch(() => {});

    res.json({ deleted: true });
  } catch {
    res.status(500).json({ error: "Failed" });
  }
}

async function getComments(req, res) {
  try {
    const comments = await Comment.find({ post: req.params.postId })
      .populate("author", "displayName")
      .lean();

    const userId = req.user?._id?.toString();
    const sanitized = comments.map((c) => sanitizeComment(c, userId));

    res.json(sanitized);
  } catch (err) {
    console.error("Error in getComments:", err);
    res.status(500).json({ error: "Failed" });
  }
}

async function getFeed(req, res) {
  try {
    const sort =
      req.query.sort === "new" ? { createdAt: -1 } : { upvoteCount: -1 };

    const posts = await Post.find()
      .sort(sort)
      .limit(50)
      .populate("author", "displayName")
      .populate("subspace", "name slug")
      .lean();

    const userId = req.user?._id?.toString();
    const sanitized = posts.map((p) => sanitizePost(p, userId));

    res.json(sanitized);
  } catch (err) {
    console.error("Error in getFeed:", err);
    res.status(500).json({ error: "Failed" });
  }
}

async function getUserSubspaces(req, res) {
  try {
    const userId = req.user._id;

    const [memberOrCreated, authoredPostSubspaceIds] = await Promise.all([
      Subspace.find({ $or: [{ members: userId }, { createdBy: userId }] })
        .select("name slug memberCount description createdBy")
        .lean(),
      Post.find({ author: userId }).distinct("subspace"),
    ]);

    const map = new Map();
    memberOrCreated.forEach((s) => map.set(s._id.toString(), s));

    const missingIds = authoredPostSubspaceIds.filter(
      (id) => !map.has(id.toString()),
    );

    const [postedIn, counts] = await Promise.all([
      missingIds.length > 0
        ? Subspace.find({ _id: { $in: missingIds } })
            .select("name slug memberCount description createdBy")
            .lean()
        : [],
      Post.aggregate([
        {
          $match: {
            subspace: {
              $in: [
                ...memberOrCreated.map((s) => s._id),
                ...missingIds,
              ],
            },
          },
        },
        { $group: { _id: "$subspace", count: { $sum: 1 } } },
      ]),
    ]);

    postedIn.forEach((s) => map.set(s._id.toString(), s));

    const subspaceList = [...map.values()];
    if (subspaceList.length === 0) return res.json([]);

    const countMap = new Map(
      counts.map((c) => [c._id.toString(), c.count]),
    );

    const bulkOps = subspaceList.map((s) => ({
      updateOne: {
        filter: { _id: s._id },
        update: { $set: { postCount: countMap.get(s._id.toString()) ?? 0 } },
      },
    }));
    Subspace.bulkWrite(bulkOps).catch(() => {});

    const result = subspaceList.map((s) => ({
      ...s,
      postCount: countMap.get(s._id.toString()) ?? 0,
      isOwner: s.createdBy?.toString() === userId.toString(),
    }));

    res.json(result);
  } catch (err) {
    console.error("getUserSubspaces error:", err);
    res.status(500).json({ error: "Failed to get user subspaces" });
  }
}

module.exports = {
  createSubspace,
  getSubspaces,
  getUserSubspaces,
  searchSubspaces,
  deleteSubspace,
  getSubspace,
  joinSubspace,
  createPost,
  getPosts,
  getPost,
  upvotePost,
  deletePost,
  createComment,
  deleteComment,
  getComments,
  getFeed,
};