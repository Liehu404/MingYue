from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import User, Partition
from app.schemas.partition import PartitionCreate, PartitionUpdate, PartitionResponse
from app.utils.dependencies import get_current_user

router = APIRouter(prefix="/partitions", tags=["partitions"])


def build_tree(partitions: list[Partition]) -> list[dict]:
    """Build a 2-level tree from flat partition list."""
    roots = [p for p in partitions if p.parent_id is None]
    result = []
    for root in roots:
        node = {
            "id": root.id,
            "name": root.name,
            "description": root.description,
            "parent_id": root.parent_id,
            "sort_order": root.sort_order,
            "created_at": root.created_at,
            "children": [],
        }
        children = [p for p in partitions if p.parent_id == root.id]
        for child in children:
            node["children"].append({
                "id": child.id,
                "name": child.name,
                "description": child.description,
                "parent_id": child.parent_id,
                "sort_order": child.sort_order,
                "created_at": child.created_at,
                "children": [],
            })
        result.append(node)
    return result


@router.get("")
async def list_partitions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Partition).order_by(Partition.sort_order))
    return result.scalars().all()


@router.get("/tree")
async def tree_partitions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Partition).order_by(Partition.sort_order))
    partitions = result.scalars().all()
    return build_tree(partitions)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_partition(
    data: PartitionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")

    if data.parent_id is not None:
        parent_result = await db.execute(select(Partition).where(Partition.id == data.parent_id))
        parent = parent_result.scalar_one_or_none()
        if not parent:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="父分区不存在")
        if parent.parent_id is not None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分区最多2层，不能在子分区下再创建分区")

    partition = Partition(**data.model_dump())
    db.add(partition)
    await db.commit()
    await db.refresh(partition)
    return partition


@router.put("/{partition_id}")
async def update_partition(
    partition_id: int,
    data: PartitionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")
    result = await db.execute(select(Partition).where(Partition.id == partition_id))
    partition = result.scalar_one_or_none()
    if not partition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分区不存在")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(partition, key, val)
    await db.commit()
    await db.refresh(partition)
    return partition


@router.delete("/{partition_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_partition(
    partition_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role.value != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅超级管理员可操作")
    result = await db.execute(select(Partition).where(Partition.id == partition_id))
    partition = result.scalar_one_or_none()
    if not partition:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="分区不存在")
    await db.delete(partition)
    await db.commit()
