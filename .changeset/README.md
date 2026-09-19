# Changesets

Thư mục này do `@changesets/cli` tự sinh ra — công cụ quản lý version/changelog cho package
`@hanoilab/voxta`. Mỗi thay đổi đáng lên version mới thì chạy `pnpm changeset` (chọn patch/minor/
major, viết mô tả ngắn) — nó tạo 1 file markdown trong thư mục này, commit file đó CÙNG với code
thay đổi.

Khi các file changeset đó được merge vào `main`, GitHub Action (`.github/workflows/publish.yml`) tự
mở 1 PR "Version Packages" gộp hết changeset đang chờ thành 1 lần bump version + cập nhật
`CHANGELOG.md`. Merge PR đó xong, cùng workflow tự publish lên npm — không cần tự tay `git tag`
nữa.

Xem thêm: https://github.com/changesets/changesets
