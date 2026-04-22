"use client"

import { useState, useEffect, useCallback } from "react"
import type { Plan } from "@/lib/types"
import { createClient } from "@/lib/supabase/client"
import { plansCache } from "@/lib/app-cache"

const supabase = createClient()

export function usePlans() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Load plans from Supabase on mount
  useEffect(() => {
    const loadPlans = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setPlans([]); setIsLoading(false); return }

        const fetchFresh = async (): Promise<Plan[]> => {
          const { data: plansData, error: plansError } = await supabase
            .from("plans").select("*").eq("user_id", user.id).order("updated_at", { ascending: false })
          if (plansError) throw plansError

          const raw = plansData || []
          const planIds = raw.map((p) => p.id)
          const { data: allCoursesData } = planIds.length > 0
            ? await supabase.from("plan_courses").select("plan_id, course_id").in("plan_id", planIds)
            : { data: [] }

          const coursesByPlanId = new Map<string, string[]>()
          for (const row of allCoursesData || []) {
            const list = coursesByPlanId.get(row.plan_id) ?? []
            list.push(row.course_id)
            coursesByPlanId.set(row.plan_id, list)
          }

          const result: Plan[] = raw.map((plan) => ({
            id: plan.id, name: plan.name, semester: plan.semester,
            courses: coursesByPlanId.get(plan.id) ?? [],
            starred: plan.starred, createdAt: plan.created_at, updatedAt: plan.updated_at,
          }))
          plansCache.write(user.id, result)
          return result
        }

        const cached = plansCache.read(user.id)
        if (cached) {
          setPlans(cached as Plan[])
          setIsLoading(false)
          // Revalidate in background
          fetchFresh().then(fresh => setPlans(fresh)).catch(() => {})
          return
        }

        const fresh = await fetchFresh()
        setPlans(fresh)
      } catch (error) {
        console.error("Error loading plans:", error)
        setPlans([])
      } finally {
        setIsLoading(false)
      }
    }

    loadPlans()
  }, [])

  // Sync current state to cache after any mutation
  const syncCache = useCallback((uid: string, updated: Plan[]) => {
    plansCache.write(uid, updated)
  }, [])

  const createPlan = useCallback(async (name: string, semester: string): Promise<Plan> => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { data, error } = await supabase
        .from("plans")
        .insert({ user_id: user.id, name, semester, starred: false })
        .select()
        .single()

      if (error) throw error

      const newPlan: Plan = {
        id: data.id, name: data.name, semester: data.semester,
        courses: [], starred: data.starred,
        createdAt: data.created_at, updatedAt: data.updated_at,
      }

      setPlans((prev) => {
        const updated = [newPlan, ...prev]
        syncCache(user.id, updated)
        return updated
      })
      return newPlan
    } catch (error) {
      console.error("Error creating plan:", error)
      throw error
    }
  }, [syncCache])

  const updatePlan = useCallback(async (id: string, updates: Partial<Plan>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from("plans")
        .update({
          ...(updates.name && { name: updates.name }),
          ...(updates.semester && { semester: updates.semester }),
          ...(updates.starred !== undefined && { starred: updates.starred }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)

      if (error) throw error

      setPlans((prev) => {
        const updated = prev.map((plan) =>
          plan.id === id ? { ...plan, ...updates, updatedAt: new Date().toISOString() } : plan
        )
        if (user) syncCache(user.id, updated)
        return updated
      })
    } catch (error) {
      console.error("Error updating plan:", error)
    }
  }, [syncCache])

  const deletePlan = useCallback(async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from("plans").delete().eq("id", id)
      if (error) throw error

      setPlans((prev) => {
        const updated = prev.filter((plan) => plan.id !== id)
        if (user) syncCache(user.id, updated)
        return updated
      })
    } catch (error) {
      console.error("Error deleting plan:", error)
    }
  }, [syncCache])

  const toggleStarred = useCallback(async (id: string) => {
    try {
      const plan = plans.find((p) => p.id === id)
      if (!plan) return

      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from("plans")
        .update({ starred: !plan.starred, updated_at: new Date().toISOString() })
        .eq("id", id)

      if (error) throw error

      setPlans((prev) => {
        const updated = prev.map((p) =>
          p.id === id ? { ...p, starred: !p.starred, updatedAt: new Date().toISOString() } : p
        )
        if (user) syncCache(user.id, updated)
        return updated
      })
    } catch (error) {
      console.error("Error toggling starred:", error)
    }
  }, [plans, syncCache])

  const duplicatePlan = useCallback(async (id: string): Promise<Plan | null> => {
    try {
      const planToCopy = plans.find((plan) => plan.id === id)
      if (!planToCopy) return null

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      // Create new plan
      const { data: newPlanData, error: createError } = await supabase
        .from("plans")
        .insert({
          user_id: user.id,
          name: `${planToCopy.name} (Copy)`,
          semester: planToCopy.semester,
          starred: false,
        })
        .select()
        .single()

      if (createError) throw createError

      // Copy courses
      if (planToCopy.courses.length > 0) {
        const coursesToInsert = planToCopy.courses.map((courseId) => ({
          plan_id: newPlanData.id,
          course_id: courseId,
        }))

        const { error: coursesError } = await supabase
          .from("plan_courses")
          .insert(coursesToInsert)

        if (coursesError) throw coursesError
      }

      const newPlan: Plan = {
        id: newPlanData.id,
        name: newPlanData.name,
        semester: newPlanData.semester,
        courses: planToCopy.courses,
        starred: newPlanData.starred,
        createdAt: newPlanData.created_at,
        updatedAt: newPlanData.updated_at,
      }

      setPlans((prev) => {
        const updated = [newPlan, ...prev]
        syncCache(user.id, updated)
        return updated
      })
      return newPlan
    } catch (error) {
      console.error("Error duplicating plan:", error)
      return null
    }
  }, [plans, syncCache])

  const getPlan = useCallback((id: string): Plan | undefined => {
    return plans.find((plan) => plan.id === id)
  }, [plans])

  const addCourseToPlan = useCallback(async (planId: string, courseId: string) => {
    try {
      const plan = plans.find((p) => p.id === planId)
      if (!plan || plan.courses.includes(courseId)) return

      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from("plan_courses").insert({ plan_id: planId, course_id: courseId })
      if (error) throw error

      setPlans((prev) => {
        const updated = prev.map((p) =>
          p.id === planId ? { ...p, courses: [...p.courses, courseId], updatedAt: new Date().toISOString() } : p
        )
        if (user) syncCache(user.id, updated)
        return updated
      })
      await updatePlan(planId, {})
    } catch (error) {
      console.error("Error adding course to plan:", error)
    }
  }, [plans, updatePlan, syncCache])

  const removeCourseFromPlan = useCallback(async (planId: string, courseId: string) => {
    try {
      const plan = plans.find((p) => p.id === planId)
      if (!plan) return

      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from("plan_courses").delete().eq("plan_id", planId).eq("course_id", courseId)
      if (error) throw error

      setPlans((prev) => {
        const updated = prev.map((p) =>
          p.id === planId ? { ...p, courses: p.courses.filter((id) => id !== courseId), updatedAt: new Date().toISOString() } : p
        )
        if (user) syncCache(user.id, updated)
        return updated
      })
      await updatePlan(planId, {})
    } catch (error) {
      console.error("Error removing course from plan:", error)
    }
  }, [plans, updatePlan, syncCache])

  return {
    plans,
    isLoading,
    createPlan,
    updatePlan,
    deletePlan,
    toggleStarred,
    duplicatePlan,
    getPlan,
    addCourseToPlan,
    removeCourseFromPlan,
  }
}
