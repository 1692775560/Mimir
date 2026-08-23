/**
 * Shared helpers of the domain service modules under `./services`.
 * The only mutable instance state (compile status map and job counter) is
 * carried by an explicit {@link ServiceState} object rather than module-level
 * mutable variables, so every `new ResearchService` gets its own copy (test
 * isolation, multi-instance correctness).
 * @module dsh-mimir/src/services/common
 */

import type {
  ResearchCompileStatusView,
  ResearchFailure,
  ResearchRejected,
  ResearchSuccess,
} from '../types.ts'

/** 唯一的可变实例状态：compileStatus（编译状态表）与 jobSeq（任务号计数器）。 */
export interface ServiceState {
  /** 每个被寻址项目的编译状态（'' 键 = 无项目槽位）；Map 引用不变，内容可变。 */
  readonly compileStatus: Map<string, ResearchCompileStatusView>
  /** 同毫秒提交的任务号单调后缀；仅 submitJob 自增。 */
  jobSeq: number
}

/** Build a frozen success branch. */
export function success<T>(value: T): ResearchSuccess<T> {
  return Object.freeze({ ok: true, value })
}

/** Build a frozen business-failure branch. */
export function rejected<E extends ResearchFailure>(error: E): ResearchRejected<E> {
  return Object.freeze({ ok: false, error: Object.freeze(error) })
}
