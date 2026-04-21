import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerCrewaiTask,
  popEntry,
  _clearTaskRegistry,
} from '../../src/core/crewai-task-registry.js';

describe('crewai-task-registry', () => {
  beforeEach(() => {
    _clearTaskRegistry();
  });

  describe('registerCrewaiTask', () => {
    it('should register a task with template and vars', () => {
      const task = { id: 'task-1' };
      const userTpl = { template: 'Tell me about {{topic}}' };
      const vars = { topic: 'cats' };

      registerCrewaiTask(task, userTpl, vars);

      const entry = popEntry('task-1');
      expect(entry).toBeDefined();
      expect(entry![0]).toBe('Tell me about {{topic}}');
      expect(entry![1]).toBe(JSON.stringify({ topic: 'cats' }));
    });

    it('should register a task without vars', () => {
      const task = { id: 'task-2' };
      const userTpl = { template: 'Static prompt' };

      registerCrewaiTask(task, userTpl);

      const entry = popEntry('task-2');
      expect(entry).toBeDefined();
      expect(entry![0]).toBe('Static prompt');
      expect(entry![1]).toBeNull();
    });

    it('should register a task with empty vars object', () => {
      const task = { id: 'task-3' };
      const userTpl = { template: 'Prompt' };

      registerCrewaiTask(task, userTpl, {});

      const entry = popEntry('task-3');
      expect(entry).toBeDefined();
      expect(entry![0]).toBe('Prompt');
      expect(entry![1]).toBeNull();
    });

    it('should convert numeric task id to string', () => {
      const task = { id: 42 };
      const userTpl = { template: 'Prompt for {{name}}' };

      registerCrewaiTask(task, userTpl, { name: 'Alice' });

      const entry = popEntry('42');
      expect(entry).toBeDefined();
      expect(entry![0]).toBe('Prompt for {{name}}');
    });

    it('should convert template to string', () => {
      const task = { id: 'task-4' };
      // template could be an array or complex object that has toString
      const userTpl = { template: { toString: () => 'custom-template' } };

      registerCrewaiTask(task, userTpl);

      const entry = popEntry('task-4');
      expect(entry).toBeDefined();
      expect(entry![0]).toBe('custom-template');
    });

    it('should overwrite existing entry for same task id', () => {
      const task = { id: 'task-5' };
      registerCrewaiTask(task, { template: 'first' });
      registerCrewaiTask(task, { template: 'second' });

      const entry = popEntry('task-5');
      expect(entry).toBeDefined();
      expect(entry![0]).toBe('second');
    });

    it('should handle undefined values in vars by converting to null', () => {
      const task = { id: 'task-6' };
      const userTpl = { template: 'Prompt' };
      const vars = { a: 'hello', b: undefined } as Record<string, any>;

      registerCrewaiTask(task, userTpl, vars);

      const entry = popEntry('task-6');
      expect(entry).toBeDefined();
      const parsed = JSON.parse(entry![1]!);
      expect(parsed.a).toBe('hello');
      expect(parsed.b).toBeNull();
    });
  });

  describe('popEntry', () => {
    it('should return undefined for non-existent task', () => {
      const entry = popEntry('non-existent');
      expect(entry).toBeUndefined();
    });

    it('should remove the entry after popping', () => {
      const task = { id: 'task-pop' };
      registerCrewaiTask(task, { template: 'Prompt' });

      const first = popEntry('task-pop');
      expect(first).toBeDefined();

      const second = popEntry('task-pop');
      expect(second).toBeUndefined();
    });

    it('should only remove the specific task entry', () => {
      registerCrewaiTask({ id: 'a' }, { template: 'A' });
      registerCrewaiTask({ id: 'b' }, { template: 'B' });

      popEntry('a');

      const entryB = popEntry('b');
      expect(entryB).toBeDefined();
      expect(entryB![0]).toBe('B');
    });
  });

  describe('_clearTaskRegistry', () => {
    it('should remove all entries', () => {
      registerCrewaiTask({ id: '1' }, { template: 'A' });
      registerCrewaiTask({ id: '2' }, { template: 'B' });
      registerCrewaiTask({ id: '3' }, { template: 'C' });

      _clearTaskRegistry();

      expect(popEntry('1')).toBeUndefined();
      expect(popEntry('2')).toBeUndefined();
      expect(popEntry('3')).toBeUndefined();
    });

    it('should be safe to call on empty registry', () => {
      _clearTaskRegistry();
      expect(popEntry('any')).toBeUndefined();
    });
  });
});
