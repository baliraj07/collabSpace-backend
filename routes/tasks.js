const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Project = require('../models/Project');
const { protect } = require('../middleware/auth');

router.use(protect);

// Helper: check project access
const checkProjectAccess = async (projectId, userId) => {
  const project = await Project.findById(projectId);
  if (!project) return { error: 'Project not found', status: 404 };
  const isMember = project.members.some(m => m.user.toString() === userId.toString());
  const isOwner = project.owner.toString() === userId.toString();
  if (!isMember && !isOwner) return { error: 'Not authorized', status: 403 };
  return { project };
};

// @route   GET /api/tasks?projectId=xxx
// @desc    Get all tasks for a project
router.get('/', async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId query required' });
    }

    const { error, status } = await checkProjectAccess(projectId, req.user._id);
    if (error) return res.status(status).json({ success: false, message: error });

    const tasks = await Task.find({ project: projectId })
      .populate('assignee', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .populate('comments.user', 'name email avatar')
      .sort({ order: 1, createdAt: -1 });

    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/tasks
// @desc    Create a task
router.post('/', async (req, res) => {
  try {
    const { title, description, status, priority, project, assignee, dueDate, tags } = req.body;

    const { error, status: errStatus } = await checkProjectAccess(project, req.user._id);
    if (error) return res.status(errStatus).json({ success: false, message: error });

    const task = await Task.create({
      title,
      description,
      status,
      priority,
      project,
      assignee: assignee || null,
      dueDate,
      tags,
      createdBy: req.user._id
    });

    await task.populate('assignee', 'name email avatar');
    await task.populate('createdBy', 'name email avatar');

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/tasks/:id
// @desc    Update task
router.put('/:id', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const { error, status } = await checkProjectAccess(task.project, req.user._id);
    if (error) return res.status(status).json({ success: false, message: error });

    const { title, description, status: taskStatus, priority, assignee, dueDate, tags, order } = req.body;

    const updated = await Task.findByIdAndUpdate(
      req.params.id,
      { title, description, status: taskStatus, priority, assignee, dueDate, tags, order },
      { new: true, runValidators: true }
    )
      .populate('assignee', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .populate('comments.user', 'name email avatar');

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   DELETE /api/tasks/:id
// @desc    Delete task
router.delete('/:id', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const { error, status } = await checkProjectAccess(task.project, req.user._id);
    if (error) return res.status(status).json({ success: false, message: error });

    await task.deleteOne();
    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   POST /api/tasks/:id/comments
// @desc    Add comment to task
router.post('/:id/comments', async (req, res) => {
  try {
    const { text } = req.body;
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

    const { error, status } = await checkProjectAccess(task.project, req.user._id);
    if (error) return res.status(status).json({ success: false, message: error });

    task.comments.push({ user: req.user._id, text });
    await task.save();
    await task.populate('comments.user', 'name email avatar');
    await task.populate('assignee', 'name email avatar');
    await task.populate('createdBy', 'name email avatar');

    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   GET /api/tasks/stats
// @desc    Get task statistics for a project
router.get('/stats/:projectId', async (req, res) => {
  try {
    const { error, status } = await checkProjectAccess(req.params.projectId, req.user._id);
    if (error) return res.status(status).json({ success: false, message: error });

    const stats = await Task.aggregate([
      { $match: { project: require('mongoose').Types.ObjectId.createFromHexString(req.params.projectId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const priorityStats = await Task.aggregate([
      { $match: { project: require('mongoose').Types.ObjectId.createFromHexString(req.params.projectId) } },
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);

    res.json({ success: true, data: { statusStats: stats, priorityStats } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
