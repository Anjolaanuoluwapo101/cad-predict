import pytest
from src.preprocess import encode, get_xy, load_config, load_data

cfg = load_config()
df = load_data(cfg)
LEAK = {"LAD", "LCX", "RCA", "Cath"}


@pytest.mark.parametrize("target", ["CAD", "LAD", "LCX", "RCA"])
def test_no_leakage_columns(target):
    X, y = get_xy(df, target, cfg)
    assert not LEAK & set(X.columns)
    assert "Exertional CP" not in X.columns
    assert set(y.unique()) == {0, 1}
    assert len(X) == len(y)


def test_all_numeric_no_nan():
    X = encode(df, cfg)
    assert not X.select_dtypes(exclude="number").shape[1]
    assert X.isna().sum().sum() == 0


def test_feature_count():
    # 59 columns - 4 answers - Exertional CP - Sex + Male + 2 BBB flags
    assert encode(df, cfg).shape[1] == 55


def test_cad_drops_contradictory_row_only():
    assert len(get_xy(df, "CAD", cfg)[0]) == len(df) - 1
    for v in ["LAD", "LCX", "RCA"]:
        assert len(get_xy(df, v, cfg)[0]) == len(df)


def test_class_counts():
    assert get_xy(df, "LAD", cfg)[1].sum() == 177
    assert get_xy(df, "LCX", cfg)[1].sum() == 119
    assert get_xy(df, "RCA", cfg)[1].sum() == 114
